export interface AppEnv {
  Bindings: Env
  Variables: {
    userId: number
    /**
     * The session's token version as the access token carries it (null in a
     * token issued before it did), set with userId by requireUser.
     */
    tokenVersion: number | null
    /**
     * The access token's session row (`user_sessions.id`; null in a token
     * from before sessions had rows), set with userId by requireUser. Only
     * requireActiveSession checks that the row is still active.
     */
    sessionId: number | null
  }
}
