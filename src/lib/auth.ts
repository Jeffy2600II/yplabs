export function synthesizeEmail(studentId: string) {
  // normalize: trim and keep only digits (optional)
  const id = String(studentId ?? "").trim();
  // use a project-local domain for synthetic emails
  return `${id}@students.yplabs`;
}