import type { Archetype, CallerProfile, Scheme } from '../data/types';
import type { ChoiceResult, Turn } from '../systems/Dialogue';
import type { MoneyEvent } from '../systems/Economy';
import type { CallRecord } from '../systems/GameState';
import type { HeatChange } from '../systems/Risk';
import { EventBus } from './EventBus';

export type Tone = 'info' | 'good' | 'bad' | 'boss' | 'warn';

export interface InboxAction {
  id: string;
  label: string;
}

export interface InboxMessage {
  id: number;
  from: string;
  subject: string;
  body: string;
  clock: number;
  read: boolean;
  tone: Tone;
  actions: InboxAction[];
  /** Ação já escolhida (bloqueia novas escolhas). */
  answered?: string;
}

/** Mapa de todos os eventos do jogo. */
export interface GameEvents {
  money: MoneyEvent;
  heat: HeatChange;
  raid: { day: number };
  notify: { title: string; body: string; tone: Tone; icon?: string };
  sfx: { id: string; volume?: number };
  'call:ring': { caller: CallerProfile };
  'call:ringPrivate': { id: string; label: string };
  'call:narrative': { id: string };
  'call:narrativeMissed': { id: string };
  'call:missed': { caller: CallerProfile };
  'call:start': { caller: CallerProfile; archetype: Archetype; scheme: Scheme; turn: Turn; outbound: boolean };
  'call:result': { result: ChoiceResult; traceLine: string | null; interject: { line: string; duration: number } | null };
  'call:timeout': { line: string; hungUp: boolean };
  'call:back': { line: string };
  'call:trace': { progress: number; active: boolean };
  'call:end': { record: CallRecord; headline: string; detail: string; good: boolean };
  'call:fileViewed': { callerId: string };
  'event:start': { id: string; title: string; description: string };
  'event:end': { id: string; success: boolean; summary: string };
  objective: { text: string | null };
  speech: { who: string; text: string; duration?: number };
  inbox: { message: InboxMessage };
  'inbox:action': { messageId: number; actionId: string };
  trigger: { id: string };
  'world:power': { on: boolean };
  'world:network': { up: boolean };
  'day:clock': { clock: number };
}

export type Bus = EventBus<GameEvents>;

export function createBus(): Bus {
  return new EventBus<GameEvents>();
}
