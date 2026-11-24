import { BoundedExpressionElement, BoundedQueryElement, GraphQueryElement, SQLiteDatabaseElement, runRecognitionHandling, VectorQueryElement } from '@kaicreator/domain-harness';
import type { BoundedQueryLimits, StandardWorkflowOutcome, WorkflowLimits } from '@kaicreator/domain-harness';

const source = Object.freeze({ url: 'https://www.isbn-international.org/content/what-isbn/10', revision: 'isbn13-2026-11-24' });
const weights = Object.freeze([1, 3, 1, 3, 1, 3, 1, 3, 1, 3, 1, 3]);
export const isbnRules = Object.freeze(['978', '979'].map(prefix => Object.freeze({ prefix, source, weights })));
type Rule = (typeof isbnRules)[number];
export interface BookRequest { isbn?: string; quantity?: number; budgetCents?: number; revision?: string }
interface Book { isbn: string; resource: string; price: number; pages: number; width: number }
interface Intent { isbn: string; quantity: number; budgetCents: number; rule: Rule }
interface Plan { resource: string; isbn: string; quantity: number; totalCents: number; comparable: readonly string[]; predecessor: readonly string[]; rule: Rule }
type Stop = Exclude<StandardWorkflowOutcome<never>, { status: 'COMPLETE' }>;
function stop(status: Stop['status'], code: string): Stop { return { status, reason: { code, message: 'Catalog plan unavailable' } }; }

/** ISBN 校验规则来自国际 ISBN 机构；合成目录不证明 ISBN 已分配或真实库存。 */
export class BookCatalogElement {
  readonly #query = new BoundedQueryElement();
  readonly #expr = new BoundedExpressionElement();
  readonly #vector = new VectorQueryElement();
  readonly #graph = new GraphQueryElement();
  #handled = 0;
  constructor(private readonly db: SQLiteDatabaseElement, private readonly tenant: string) {}
  get handled(): number { return this.#handled; }
  lookup(isbn: string, revision: string, limits: BoundedQueryLimits = { maxVisited: 2, maxReturned: 3 }) {
    return this.#query.select(isbnRules, r => isbn.startsWith(r.prefix) && r.source.revision === revision, limits);
  }
  private recognize(input: BookRequest, queryLimits?: BoundedQueryLimits): StandardWorkflowOutcome<Intent> {
    const { isbn, quantity, budgetCents, revision } = input;
    if (isbn === undefined || quantity === undefined || budgetCents === undefined || revision === undefined) return stop('ASK', 'BOOK_INPUT_REQUIRED');
    if (!/^\d{13}$/u.test(isbn) || !Number.isSafeInteger(quantity) || quantity < 1 || quantity > 100 || !Number.isSafeInteger(budgetCents) || budgetCents < 0) return stop('REJECT', 'BOOK_INPUT_INVALID');
    const selected = this.lookup(isbn, revision, queryLimits);
    const rule = selected.items[0];
    if (!selected.complete || selected.items.length !== 1 || !rule) return stop('UNKNOWN', 'ISBN_RULE_UNRESOLVED');
    const sum = rule.weights.reduce((n, w, i) => n + w * Number(isbn[i]), 0);
    if ((sum + Number(isbn[12])) % 10 !== 0) return stop('REJECT', 'ISBN_CHECK_DIGIT');
    return { status: 'COMPLETE', value: { isbn, quantity, budgetCents, rule } };
  }
  private handle(intent: Intent): StandardWorkflowOutcome<Plan> {
    this.#handled += 1;
    const books = this.db.select<Book>('SELECT isbn,resource,price,pages,width FROM books WHERE tenant=? AND revision=? ORDER BY isbn', [this.tenant, intent.rule.source.revision], 32);
    const exact = this.#query.select(books, b => b.isbn === intent.isbn, { maxVisited: 32, maxReturned: 33 });
    const book = exact.items[0];
    if (!exact.complete || exact.items.length !== 1 || !book) return stop('UNKNOWN', 'BOOK_CATALOG_UNRESOLVED');
    if (!Number.isSafeInteger(book.price) || book.price < 0) return stop('UNKNOWN', 'BOOK_PRICE_UNRESOLVED');
    const total = this.#expr.evaluate('{"op":"mul","args":[{"op":"get","path":["price"]},{"op":"get","path":["quantity"]}]}', JSON.stringify({ price: book.price, quantity: intent.quantity }));
    if (typeof total !== 'number' || total > intent.budgetCents) return stop('REJECT', 'BOOK_OVER_BUDGET');
    const near = this.#vector.search(books.map(item => ({ id: item.isbn, vector: [item.pages / 100, item.width / 10], item })), [book.pages / 100, book.width / 10], item => item.isbn !== book.isbn, { topK: 1, maxVisited: 32, dimension: 2, metric: 'L2' });
    const edges = this.db.select<{ from: string; to: string; type: string }>('SELECT newer AS "from",older AS "to",relation AS type FROM editions WHERE tenant=? AND revision=? ORDER BY newer,older', [this.tenant, intent.rule.source.revision], 32);
    const ids = new Set(books.map(b => b.isbn));
    const path = this.#graph.search(edges.filter(e => ids.has(e.from) && ids.has(e.to)), { start: book.isbn, direction: 'OUT', relationTypes: ['supersedes'], limits: { maxDepth: 2, maxVisited: 128, maxReturned: 32 } });
    if (!near.complete || !path.complete) return stop('UNKNOWN', 'BOOK_INDEX_INCOMPLETE');
    return { status: 'COMPLETE', value: { isbn: book.isbn, resource: book.resource, quantity: intent.quantity, totalCents: total, comparable: near.matches.map(m => m.id), predecessor: path.paths.map(p => p.nodes[p.nodes.length - 1] as string), rule: intent.rule } };
  }
  async plan(input: BookRequest, limits: WorkflowLimits, queryLimits?: BoundedQueryLimits): Promise<StandardWorkflowOutcome<Plan>> {
    return runRecognitionHandling(limits,
      () => this.recognize(input, queryLimits),
      intent => this.handle(intent));
  }
}
