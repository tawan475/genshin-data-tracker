export interface AppEnv {
  Bindings: Env
  Variables: {
    userId: number
    /**
     * The session's token version as the access token carries it (null in a
     * token issued before it did), set with userId by requireUser.
     */
    tokenVersion: number | null
  }
}
