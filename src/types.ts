export enum Position {
  P1 = 1, P2 = 2, P3 = 3, P4 = 4, P5 = 5, P6 = 6
}
export enum PlayerRole {
  Setter = 'Armador', OutsideHitter = 'Punta', Opposite = 'Opuesto', MiddleBlocker = 'Central', Libero = 'Libero', DefensiveSpecialist = 'Defensa'
}
export interface PlayerProfileDetails {
  bio: string; height: number; weight: number; spikeReach?: number; blockReach?: number; birthDate?: string; photoUrl: string; achievements: string[]; instagram?: string;
}
export interface Player {
  id: string; name: string; number: number; role: PlayerRole; isCaptain: boolean; stats: PlayerStats; profile: PlayerProfileDetails;
}
export interface PlayerStats {
  points: number; aces: number; blocks: number; errors: number; matchesPlayed: number; mvps: number; yellowCards: number; redCards: number;
}
export interface Team {
  id: string; name: string; color: string; logoUrl?: string; players: Player[]; coachName: string;
}
export interface MatchSet {
  scoreA: number; scoreB: number; history: PointLog[]; durationMinutes: number;
}
export interface PointLog {
  teamId: string; playerId?: string; type: 'attack' | 'block' | 'ace' | 'opponent_error' | 'yellow_card' | 'red_card'; scoreSnapshot: string;
}
export interface Tournament {
  id: string; ownerId: string; name: string; logoUrl?: string; startDate: string; endDate: string; teams: Team[]; groups: { [key: string]: string[] }; fixtures: MatchFixture[];
}
export interface MatchFixture {
  id: string; date: string; teamAId: string; teamBId: string; group: string; status: 'scheduled' | 'live' | 'finished'; winnerId?: string; resultString?: string;
}
export interface MatchConfig {
  maxSets: number; pointsPerSet: number; tieBreakPoints: number;
}
export interface LiveMatchState {
  matchId: string; config: MatchConfig; status: 'warmup' | 'playing' | 'paused' | 'finished_set' | 'finished'; currentSet: number; sets: MatchSet[]; rotationA: Player[]; rotationB: Player[]; benchA: Player[]; benchB: Player[]; servingTeamId: string; scoreA: number; scoreB: number; timeoutsA: number; timeoutsB: number; substitutionsA: number; substitutionsB: number; requests: RequestItem[]; showLeaderboard?: boolean; showStats?: boolean; showScoreboard?: boolean;
}
export interface RequestItem {
  id: string; teamId: string; type: 'timeout' | 'substitution'; subDetails?: { playerOutId: string; playerInId: string; }; status: 'pending' | 'approved' | 'rejected';
}
export type UserRole = 'ADMIN' | 'COACH_A' | 'COACH_B' | 'PLAYER' | 'VIEWER' | 'REFEREE';
export interface User {
  id: string; username: string; password?: string; role: UserRole; createdBy?: string; linkedPlayerId?: string; linkedTeamId?: string;
}