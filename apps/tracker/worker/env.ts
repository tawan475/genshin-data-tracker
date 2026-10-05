export interface AppEnv {
  Bindings: Env
  Variables: {
    userId: number
    /** The access token's expiry (epoch seconds), set with userId by requireUser. */
    tokenExp: number
  }
}
