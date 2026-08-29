export type GameWithRelations = {
  id: string;
  stadium: string;
  homeTeam: string;
  awayTeam: string;
  gameDateTime: string;
  createdAt: string;
  updatedAt: string;
  videoClips: VideoClipRecord[];
  plays: PlayRecord[];
};

export type PlayRecord = {
  id: string;
  gameId: string;
  startTime: number;
  endTime: number;
  offenseTeam: string | null;
  notes: string | null;
  createdAt: string | Date;
  updatedAt: string | Date;
  clientKey?: string;
};

export type VideoClipRecord = {
  id: string;
  gameId: string;
  blobUrl: string;
  filename: string;
  capturedAt: string | Date;
  duration: number;
  sortOrder: number;
  createdAt: string | Date;
};

export type PlayDraft = {
  id?: string;
  clientKey?: string;
  startTime: number;
  endTime: number;
  offenseTeam?: string | null;
  notes?: string | null;
};

export type PlayGap = {
  startTime: number;
  endTime: number;
};
