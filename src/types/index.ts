export type GameWithRelations = {
  id: string;
  stadium: string;
  homeTeam: string;
  awayTeam: string;
  gameDateTime: string;
  createdAt: string;
  updatedAt: string;
  videoClips: VideoClipRecord[];
  plays: PlayWithClip[];
};

export type PlayRecord = {
  id: string;
  gameId: string;
  videoClipId: string;
  startTime: number;
  endTime: number;
  playNumber: number;
  offenseTeam: string | null;
  notes: string | null;
  sortOrder: number;
  createdAt: string | Date;
  updatedAt: string | Date;
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

export type PlayWithClip = PlayRecord & {
  videoClip?: VideoClipRecord;
};

export type PlayDraft = {
  id?: string;
  videoClipId: string;
  startTime: number;
  endTime: number;
  playNumber: number;
  offenseTeam?: string | null;
  notes?: string | null;
  sortOrder: number;
};
