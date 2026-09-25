import SwiftUI

struct ContentView: View {
    @EnvironmentObject private var healthKit: HealthKitManager
    @AppStorage(SettingsKeys.selectedUserId) private var selectedUserId: String = ""
    @State private var sessions: [WorkoutSession] = []
    @State private var isSyncing = false
    @State private var statusMessage: String?
    @State private var showSettings = false

    private let apiClient = APIClient()

    var body: some View {
        NavigationStack {
            List {
                Section {
                    if !healthKit.isAuthorized {
                        Button("Grant Health Access") {
                            Task { await healthKit.requestAuthorization() }
                        }
                    }
                    Button {
                        Task { await syncNow() }
                    } label: {
                        if isSyncing {
                            ProgressView()
                        } else {
                            Text("Sync Now")
                        }
                    }
                    .disabled(!healthKit.isAuthorized || isSyncing)

                    if let statusMessage {
                        Text(statusMessage)
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                    }
                    if let error = healthKit.lastError {
                        Text(error)
                            .font(.footnote)
                            .foregroundStyle(.red)
                    }
                }

                Section("Recent sessions") {
                    if sessions.isEmpty {
                        Text("No sessions found yet. Tap Sync Now after your wife records a Cooldown or Other workout.")
                            .foregroundStyle(.secondary)
                    }
                    ForEach(sessions) { session in
                        VStack(alignment: .leading, spacing: 4) {
                            Text(session.startDate.formatted(date: .abbreviated, time: .shortened))
                                .font(.headline)
                            Text("\(Int(session.duration / 60)) min · \(session.heartRateSamples.count) samples")
                                .font(.subheadline)
                                .foregroundStyle(.secondary)
                            if let avg = session.averageBPM, let min = session.minBPM, let max = session.maxBPM {
                                Text("avg \(Int(avg)) bpm · range \(Int(min))–\(Int(max)) bpm")
                                    .font(.subheadline)
                            }
                        }
                    }
                }
            }
            .navigationTitle("hrCollector")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Settings") { showSettings = true }
                }
            }
            .sheet(isPresented: $showSettings) { SettingsView() }
            .task {
                // Best-effort: resolve to Lori automatically so the app
                // works out of the box without a trip to Settings. If the
                // server isn't reachable yet this silently no-ops — Sync
                // Now retries it and surfaces a real error if it's still
                // unresolved then.
                _ = await resolveSelectedUserId()
                if healthKit.isAuthorized {
                    await refreshFromHealthKit()
                }
            }
        }
    }

    private func refreshFromHealthKit() async {
        do {
            sessions = try await healthKit.fetchRecordedSessions()
        } catch {
            statusMessage = "Couldn't read HealthKit: \(error.localizedDescription)"
        }
    }

    /// This phone is Lori's — there's only ever one real user of the iOS
    /// app — so rather than making her pick herself from a list, this
    /// resolves (and remembers) her user id automatically the first time
    /// it's needed.
    private func resolveSelectedUserId() async -> String? {
        if !selectedUserId.isEmpty { return selectedUserId }
        do {
            let users = try await apiClient.fetchUsers()
            if let lori = users.first(where: { $0.name.caseInsensitiveCompare("Lori") == .orderedSame }) {
                selectedUserId = lori.id
                return lori.id
            }
        } catch {
            // Sync Now surfaces a clearer error if this is still
            // unresolved when actually needed.
        }
        return nil
    }

    private func syncNow() async {
        isSyncing = true
        statusMessage = nil
        defer { isSyncing = false }

        guard let userId = await resolveSelectedUserId() else {
            statusMessage = "Couldn't find a user to sync as — check the server URL in Settings."
            return
        }

        await refreshFromHealthKit()
        let result = await apiClient.uploadAll(sessions, userId: userId)
        if result.failed.isEmpty {
            statusMessage = "Synced \(result.succeeded) session(s)."
        } else {
            statusMessage = "Synced \(result.succeeded), failed \(result.failed.count) — check the server URL in Settings."
        }
    }
}
