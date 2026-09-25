declare namespace Express {
  interface Request {
    requestId: string
    startTime: number
  }
}
