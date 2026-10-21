import type { Bus, InboxAction, InboxMessage, Tone } from '../core/events';
import type { GameState } from './GameState';

/** Mensagens internas da intranet ("FortunaZap"). */
export class Inbox {
  messages: InboxMessage[] = [];
  private nextId = 1;
  private handlers = new Map<number, (actionId: string) => void>();

  constructor(
    private readonly state: GameState,
    private readonly bus: Bus,
  ) {}

  reset(): void {
    this.messages = [];
    this.handlers.clear();
  }

  push(from: string, subject: string, body: string, tone: Tone = 'info', actions: InboxAction[] = [], onAction?: (id: string) => void): InboxMessage {
    const msg: InboxMessage = {
      id: this.nextId++,
      from,
      subject,
      body,
      clock: this.state.day.clock,
      read: false,
      tone,
      actions,
    };
    this.messages.unshift(msg);
    if (onAction) this.handlers.set(msg.id, onAction);
    this.bus.emit('inbox', { message: msg });
    this.bus.emit('sfx', { id: 'message' });
    return msg;
  }

  /** Executa a ação escolhida numa mensagem (uma vez só). */
  act(messageId: number, actionId: string): void {
    const msg = this.messages.find((m) => m.id === messageId);
    if (!msg || msg.answered) return;
    msg.answered = actionId;
    msg.read = true;
    this.handlers.get(messageId)?.(actionId);
    this.bus.emit('inbox:action', { messageId, actionId });
  }

  markRead(id: number): void {
    const m = this.messages.find((x) => x.id === id);
    if (m) m.read = true;
  }

  get unread(): number {
    return this.messages.filter((m) => !m.read).length;
  }
}
