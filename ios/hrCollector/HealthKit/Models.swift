import Foundation

/// A single heart rate reading recorded during a workout.
struct HeartRateSample: Codable, Identifiable, Hashable {
    var id: Date { timestamp }
    let timestamp: Date
    let bpm: Double
}

/// One recorded workout session (e.g. a Cooldown) plus every heart rate
/// sample HealthKit associated with it.
struct WorkoutSession: Codable, Identifiable, Hashable {
    /// HealthKit's own UUID for the HKWorkout — used as the idempotency key
    /// when uploading, so re-syncing the same workout twice doesn't duplicate it.
    let workoutId: String
    var id: String { workoutId }

    let activityType: String
    let startDate: Date
    let endDate: Date
    let heartRateSamples: [HeartRateSample]

    var duration: TimeInterval { endDate.timeIntervalSince(startDate) }

    var averageBPM: Double? {
        guard !heartRateSamples.isEmpty else { return nil }
        return heartRateSamples.map(\.bpm).reduce(0, +) / Double(heartRateSamples.count)
    }

    var minBPM: Double? { heartRateSamples.map(\.bpm).min() }
    var maxBPM: Double? { heartRateSamples.map(\.bpm).max() }
}
