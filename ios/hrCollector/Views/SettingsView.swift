import SwiftUI

struct SettingsView: View {
    @AppStorage(SettingsKeys.serverBaseURL) private var serverBaseURL: String = ""
    @AppStorage(SettingsKeys.selectedUserId) private var selectedUserId: String = ""
    @Environment(\.dismiss) private var dismiss

    @State private var users: [UserSummary] = []
    @State private var loadError: String?
    @State private var isLoading = false

    private let apiClient = APIClient()

    var body: some View {
        NavigationStack {
            Form {
                Section("Server") {
                    TextField("http://192.168.1.23:4000", text: $serverBaseURL)
                        .keyboardType(.URL)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                }
                Section {
                    Text("Enter your Mac's LAN IP and the port the server is running on (default 4000). Both devices need to be on the same Wi-Fi network.")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }

                Section("Uploading as") {
                    if users.isEmpty {
                        if isLoading {
                            ProgressView()
                        } else {
                            Text("Load the user list after setting the server URL above.")
                                .font(.footnote)
                                .foregroundStyle(.secondary)
                        }
                    } else {
                        Picker("User", selection: $selectedUserId) {
                            Text("Choose…").tag("")
                            ForEach(users) { user in
                                Text(user.name).tag(user.id)
                            }
                        }
                    }
                    Button(users.isEmpty ? "Load Users" : "Refresh Users") {
                        Task { await loadUsers() }
                    }
                    .disabled(isLoading)
                    if let loadError {
                        Text(loadError)
                            .font(.footnote)
                            .foregroundStyle(.red)
                    }
                }
            }
            .navigationTitle("Settings")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") { dismiss() }
                }
            }
            .task {
                if !serverBaseURL.isEmpty { await loadUsers() }
            }
        }
    }

    private func loadUsers() async {
        isLoading = true
        loadError = nil
        defer { isLoading = false }
        do {
            users = try await apiClient.fetchUsers()
            // Lori is the only real user of this app (it's her phone) —
            // default to her instead of making anyone pick.
            if selectedUserId.isEmpty, let lori = users.first(where: { $0.name.caseInsensitiveCompare("Lori") == .orderedSame }) {
                selectedUserId = lori.id
            }
        } catch {
            loadError = "Couldn't load users: \(error.localizedDescription)"
        }
    }
}
