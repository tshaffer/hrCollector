import Foundation
import HealthKit

/// Owns all HealthKit access: requesting authorization, finding the
/// workouts used to record heart rate (Cooldown or Other — see
/// `recordedActivityTypes` below), and pulling the heart rate samples
/// recorded during each one.
///
/// Background auto-sync: `startObservingNewWorkouts` sets up an
/// `HKObserverQuery` with background delivery enabled, so iOS *can* wake the
/// app briefly when a new workout is saved. In practice, background wake
/// timing for HealthKit observers is opportunistic (it's not instant, and
/// iOS can batch/delay it) — this needs to be verified on a real device
/// over a few days of normal use. The "Sync Now" button is the reliable
/// path in the meantime.
@MainActor
final class HealthKitManager: ObservableObject {
    private let healthStore = HKHealthStore()

    @Published var isAuthorized = false
    @Published var lastError: String?

    private let heartRateType = HKQuantityType(.heartRate)
    private let workoutType = HKObjectType.workoutType()

    private var observerQuery: HKObserverQuery?

    /// The workout types she actually uses to record a continuous heart
    /// rate stream: "Cooldown" (what she's used so far) and "Other" (the
    /// generic catch-all workout type, in case she ever starts one of
    /// those instead — same start/stop mechanics, still recorded as an
    /// HKWorkout with continuous heart rate).
    private let recordedActivityTypes: [HKWorkoutActivityType] = [.cooldown, .other]

    var isHealthDataAvailable: Bool { HKHealthStore.isHealthDataAvailable() }

    func requestAuthorization() async {
        guard isHealthDataAvailable else {
            lastError = "Health data isn't available on this device."
            return
        }
        do {
            try await healthStore.requestAuthorization(
                toShare: [],
                read: [heartRateType, workoutType]
            )
            isAuthorized = true
            lastError = nil
        } catch {
            lastError = "HealthKit authorization failed: \(error.localizedDescription)"
        }
    }

    /// Fetches recent workouts, filtered to the given activity types (pass
    /// an empty array for all workout types), most recent first.
    func fetchWorkouts(
        activityTypes: [HKWorkoutActivityType]? = nil,
        limit: Int = 50
    ) async throws -> [HKWorkout] {
        let types = activityTypes ?? recordedActivityTypes
        var predicate: NSPredicate? = nil
        if !types.isEmpty {
            let subpredicates = types.map { HKQuery.predicateForWorkouts(with: $0) }
            predicate = subpredicates.count == 1
                ? subpredicates[0]
                : NSCompoundPredicate(orPredicateWithSubpredicates: subpredicates)
        }
        let sort = [NSSortDescriptor(key: HKSampleSortIdentifierStartDate, ascending: false)]

        return try await withCheckedThrowingContinuation { continuation in
            let query = HKSampleQuery(
                sampleType: workoutType,
                predicate: predicate,
                limit: limit,
                sortDescriptors: sort
            ) { _, samples, error in
                if let error {
                    continuation.resume(throwing: error)
                    return
                }
                continuation.resume(returning: (samples as? [HKWorkout]) ?? [])
            }
            healthStore.execute(query)
        }
    }

    /// Fetches every heart rate sample HealthKit recorded during `workout`.
    func heartRateSamples(for workout: HKWorkout) async throws -> [HeartRateSample] {
        let predicate = HKQuery.predicateForObjects(from: workout)
        let sort = [NSSortDescriptor(key: HKSampleSortIdentifierStartDate, ascending: true)]

        let samples: [HKQuantitySample] = try await withCheckedThrowingContinuation { continuation in
            let query = HKSampleQuery(
                sampleType: heartRateType,
                predicate: predicate,
                limit: HKObjectQueryNoLimit,
                sortDescriptors: sort
            ) { _, samples, error in
                if let error {
                    continuation.resume(throwing: error)
                    return
                }
                continuation.resume(returning: (samples as? [HKQuantitySample]) ?? [])
            }
            healthStore.execute(query)
        }

        let bpmUnit = HKUnit.count().unitDivided(by: .minute())
        return samples.map {
            HeartRateSample(
                timestamp: $0.startDate,
                bpm: $0.quantity.doubleValue(for: bpmUnit)
            )
        }
    }

    /// Convenience: fetches Cooldown + Other workouts and their heart rate
    /// series together, as ready-to-upload `WorkoutSession` values.
    func fetchRecordedSessions(limit: Int = 50) async throws -> [WorkoutSession] {
        let workouts = try await fetchWorkouts(activityTypes: recordedActivityTypes, limit: limit)
        var sessions: [WorkoutSession] = []
        for workout in workouts {
            let samples = try await heartRateSamples(for: workout)
            sessions.append(
                WorkoutSession(
                    workoutId: workout.uuid.uuidString,
                    activityType: activityTypeLabel(for: workout.workoutActivityType),
                    startDate: workout.startDate,
                    endDate: workout.endDate,
                    heartRateSamples: samples
                )
            )
        }
        return sessions
    }

    /// Maps a workout's HealthKit activity type to the label stored/shown
    /// for it. Anything besides Cooldown is reported as "other" — in
    /// practice that's only ever `.other` itself, since `recordedActivityTypes`
    /// is what we query for in the first place.
    private func activityTypeLabel(for type: HKWorkoutActivityType) -> String {
        switch type {
        case .cooldown: return "cooldown"
        default: return "other"
        }
    }

    /// Sets up a background observer so iOS can notify this app when a new
    /// workout is saved, even if the app isn't in the foreground. Call once,
    /// e.g. at app launch after authorization succeeds.
    func startObservingNewWorkouts(onNewWorkout: @escaping () -> Void) {
        let query = HKObserverQuery(sampleType: workoutType, predicate: nil) { [weak self] _, completionHandler, error in
            defer { completionHandler() }
            guard error == nil else { return }
            Task { @MainActor in onNewWorkout() }
            _ = self
        }
        observerQuery = query
        healthStore.execute(query)
        healthStore.enableBackgroundDelivery(for: workoutType, frequency: .immediate) { _, error in
            if let error {
                Task { @MainActor [weak self] in
                    self?.lastError = "Background delivery setup failed: \(error.localizedDescription)"
                }
            }
        }
    }
}
