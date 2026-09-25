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
                    if selectedUserId.isEmpty {
                        Text("Pick a user in Settings before syncing.")
                            .font(.footnote)
                            .foregroundStyle(.secondary)
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
                    .disabled(!healthKit.isAuthorized || isSyncing || selectedUserId.isEmpty)

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

    private func syncNow() async {
        guard !selectedUserId.isEmpty else {
            statusMessage = "Pick a user in Settings before syncing."
            return
        }

        isSyncing = true
        statusMessage = nil
        defer { isSyncing = false }

        await refreshFromHealthKit()
        let result = await apiClient.uploadAll(sessions, userId: selectedUserId)
        if result.failed.isEmpty {
            statusMessage = "Synced \(result.succeeded) session(s)."
        } else {
            statusMessage = "Synced \(result.succeeded), failed \(result.failed.count) — check the server URL in Settings."
        }
    }
}
