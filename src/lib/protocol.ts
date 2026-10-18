export type Status = "available" | "busy";

export interface Profile {
  name: string;
  color: string;
  city: string;
  country: string;
  lat: number;
  lng: number;
  tz: string;
}

export interface Peer extends Profile {
  id: string;
  status: Status;
  joinedAt: string;
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
  | { type: "welcome"; id: string; peers: Peer[] }
  | { type: "join"; peer: Peer }
  | { type: "update"; peer: Peer }
  | { type: "leave"; id: string }
  | { type: "signal"; from: string; data: SignalData }
  | { type: "signal-error"; to: string; reason: string }
  | { type: "error"; message: string };
