export interface BackgroundGenerateTextPayload {
  providerId: string
  system?: string
  prompt: string
  temperature?: number
  maxRetries?: number
}

export interface BackgroundGenerateTextResponse {
  text: string
}
