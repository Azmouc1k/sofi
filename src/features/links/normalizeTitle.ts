// Link targets match note titles regardless of case and surrounding
// spaces, so [[my note]] links to "My Note". Shared by the server (index,
// backlinks, graph) and the client (opening a link) so they always agree.
export function normalizeTitle(title: string): string {
  return title.trim().toLowerCase()
}
