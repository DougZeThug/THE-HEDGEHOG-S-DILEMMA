import type { Interpretation } from './schema';

/**
 * An interpreter turns a visitor's words into artistic material — never into a reply.
 * The default is LocalInterpreter (no network). A future model-backed interpreter must
 * implement this interface and return data that passes validateInterpretation().
 */
export interface Interpreter {
  readonly name: string;
  interpret(text: string): Promise<Interpretation>;
}

/**
 * Placeholder for an opt-in remote interpreter. Deliberately not wired into the app:
 * enabling it would require an explicit visitor opt-in, a configured endpoint, and the
 * response must pass validateInterpretation() before the engine sees it. Falls back to
 * the local interpreter on any failure.
 */
export class RemoteInterpreterStub implements Interpreter {
  readonly name = 'remote-stub';
  constructor(private fallback: Interpreter) {}
  async interpret(text: string): Promise<Interpretation> {
    return this.fallback.interpret(text);
  }
}
