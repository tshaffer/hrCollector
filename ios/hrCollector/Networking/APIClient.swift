import Foundation

enum APIError: LocalizedError {
    case invalidBaseURL
    case server(String)

    var errorDescription: String? {
        switch self {
        case .invalidBaseURL: return "The server URL in Settings isn't valid."
        case .server(let message): return message
        }
    }
}

/// Talks to the hrCollector Express server. Base URL is whatever the user
/// set in Settings — for local dev this is the Mac's LAN IP, e.g.
/// "http://192.168.1.23:4000".
final class APIClient {
    private let session = URLSession(configuration: .default)

    private var baseURL: URL? {
        URL(string: UserDefaults.standard.string(forKey: SettingsKeys.serverBaseURL) ?? "")
    }

    private lazy var encoder: JSONEncoder = {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        return encoder
    }()

    private lazy var decoder: JSONDecoder = {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return decoder
    }()

    /// The fixed set of people the server tracks — used to populate the
    /// user picker in Settings.
    func fetchUsers() async throws -> [UserSummary] {
        guard let baseURL else { throw APIError.invalidBaseURL }
        let request = URLRequest(url: baseURL.appendingPathComponent("/api/users"))
        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse else {
            throw APIError.server("No response from server.")
        }
        guard (200...299).contains(http.statusCode) else {
            throw APIError.server("Server returned \(http.statusCode) while loading users.")
        }
        return try decoder.decode([UserSummary].self, from: data)
    }

    /// The JSON body a session upload actually sends — a WorkoutSession's
    /// fields plus which user it belongs to.
    private struct SessionUploadPayload: Encodable {
        let userId: String
        let workoutId: String
        let activityType: String
        let startDate: Date
        let endDate: Date
        let heartRateSamples: [HeartRateSample]
    }

    /// Upserts one session for the given user. The server treats
    /// `workoutId` as the idempotency key, so calling this again for a
    /// session already synced just updates it rather than duplicating it.
    func upload(_ session: WorkoutSession, userId: String) async throws {
        guard let baseURL else { throw APIError.invalidBaseURL }
        var request = URLRequest(url: baseURL.appendingPathComponent("/api/sessions"))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        let payload = SessionUploadPayload(
            userId: userId,
            workoutId: session.workoutId,
            activityType: session.activityType,
            startDate: session.startDate,
            endDate: session.endDate,
            heartRateSamples: session.heartRateSamples
        )
        request.httpBody = try encoder.encode(payload)

        let (data, response) = try await self.session.data(for: request)
        guard let http = response as? HTTPURLResponse else {
            throw APIError.server("No response from server.")
        }
        guard (200...299).contains(http.statusCode) else {
            let body = String(data: data, encoding: .utf8) ?? ""
            throw APIError.server("Server returned \(http.statusCode): \(body)")
        }
    }

    func uploadAll(
        _ sessions: [WorkoutSession],
        userId: String
    ) async -> (succeeded: Int, failed: [(WorkoutSession, Error)]) {
        var succeeded = 0
        var failed: [(WorkoutSession, Error)] = []
        for session in sessions {
            do {
                try await upload(session, userId: userId)
                succeeded += 1
            } catch {
                failed.append((session, error))
            }
        }
        return (succeeded, failed)
    }
}

enum SettingsKeys {
    static let serverBaseURL = "serverBaseURL"
    /// The id of the user (from /api/users) this phone's HealthKit data
    /// should be uploaded as.
    static let selectedUserId = "selectedUserId"
}
