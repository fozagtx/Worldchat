export type Status = "available" | "busy" | "matching";
export type Gender = "m" | "f" | "x";
export type Seeking = "any" | "m" | "f";

export interface Profile {
  name: string;
  avatar: string;
  color: string;
  gender: Gender;
  seeking: Seeking;
  interests: string[];
  city: string;
  country: string;
  cc: string;
  lat: number;
  lng: number;
  tz: string;
}

export interface Peer extends Profile {
  id: string;
  status: Status;
  joinedAt: string;
}

export interface ActivityEvent {
  id: string;
  kind: "join" | "leave" | "talking" | "knock";
  names: string[];
  cc: string;
  city: string;
  at: number;
}

export type SignalData =
  | { kind: "ring"; callId: string }
  | { kind: "accept"; callId: string }
  | { kind: "decline"; callId: string; reason: "declined" | "busy" | "missed" }
  | { kind: "cancel"; callId: string }
  | { kind: "hangup"; callId: string }
  | { kind: "offer"; callId: string; sdp: RTCSessionDescriptionInit }
  | { kind: "answer"; callId: string; sdp: RTCSessionDescriptionInit }
  | { kind: "ice"; callId: string; candidate: RTCIceCandidateInit }
  | { kind: "media"; callId: string; audio: boolean; video: boolean };

export type ServerMessage =
  | { type: "welcome"; id: string; peers: Peer[]; activity?: ActivityEvent[] }
  | { type: "join"; peer: Peer }
  | { type: "update"; peer: Peer }
  | { type: "leave"; id: string }
  | { type: "signal"; from: string; data: SignalData }
  | { type: "signal-error"; to: string; reason: string }
  | { type: "matched"; peer: Peer; callId: string; role: "offer" | "answer"; shared: string[] }
  | { type: "queued"; to: string; position: number }
  | { type: "knocks"; count: number; names: string[] }
  | { type: "knock-error"; to: string; reason: string }
  | { type: "your-turn"; peer: Peer }
  | { type: "queue-closed"; to: string }
  | { type: "activity"; event: ActivityEvent }
  | { type: "error"; message: string };
