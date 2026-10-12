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
