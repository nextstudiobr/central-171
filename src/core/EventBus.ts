/**
 * Barramento de eventos tipado. Todos os sistemas conversam por aqui em vez de
 * se referenciarem diretamente, o que mantém o estado único e evita contadores
 * paralelos.
 */
type Handler<T> = (payload: T) => void;

export class EventBus<E extends object> {
  private handlers = new Map<keyof E, Set<Handler<never>>>();

  /** Registra um ouvinte e devolve a função que o remove. */
  on<K extends keyof E>(key: K, handler: Handler<E[K]>): () => void {
    let set = this.handlers.get(key);
    if (!set) {
      set = new Set();
      this.handlers.set(key, set);
    }
    set.add(handler as Handler<never>);
    return () => set!.delete(handler as Handler<never>);
  }

  /** Dispara um evento. Um ouvinte que falha não impede os demais. */
  emit<K extends keyof E>(key: K, payload: E[K]): void {
    const set = this.handlers.get(key);
    if (!set) return;
    for (const h of [...set]) {
      try {
        (h as Handler<E[K]>)(payload);
      } catch (err) {
        console.error(`[EventBus] erro no ouvinte de "${String(key)}"`, err);
      }
    }
  }

  clear(): void {
    this.handlers.clear();
  }
}
