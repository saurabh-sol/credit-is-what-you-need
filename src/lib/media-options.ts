// The choices the playground offers for pictures and clips. Kept apart from
// media.ts, which loads the AI SDK and so can only run on the server.
export const IMAGE_SIZES = ["1024x1024", "1536x1024", "1024x1536"] as const;
export const VIDEO_DURATIONS = [4, 6, 8] as const;
export const VIDEO_RESOLUTIONS = ["720p", "1080p"] as const;
export const VIDEO_ASPECTS = ["16:9", "9:16"] as const;
