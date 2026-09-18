# Adopt the Evidence Lens interface

The MVP frontend uses the Evidence Lens model: a quiet context rail, one
dominant work surface, and an evidence lens beside it. The product root is the
Writing Desk — recent Evaluations left, the Writing Sample in the centre,
Evaluation evidence right — so the common path is "enter, submit" rather than
"navigate, enter, submit", and the latest evidence sits beside the writing
that produced it. A successful submission is stored immediately and can still
be opened as an immutable Evaluation Detail.

History, Progress, Evaluation Detail, and Setup & privacy stay separate routes
because they answer different questions. They reuse the grammar rather than
copying the Writing Desk: Progress keeps period-based insights and category
bars in the work surface with source Findings in the evidence lens.

This replaced a primary-navigation contract with a standalone New Evaluation
destination; `/evaluations/new` only redirects to the Writing Desk. Submission
stays deliberate — typing never sends or stores, **Evaluate writing** is
explicit, pending and failure states preserve the exact draft, and editing
after success never re-evaluates.

The cost is a denser responsive layout. Wide screens use three regions; narrow
screens put the work surface first, then the evidence lens, then secondary
context. No information or action may depend on a desktop-only rail.
