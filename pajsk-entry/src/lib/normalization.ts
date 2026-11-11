export const normalizeSearchText = (value: string) =>
  value.trim().toLocaleLowerCase('ms-MY').replace(/\s+/g, ' ')

export const matchesStudentName = (name: string, query: string) =>
  normalizeSearchText(name).includes(normalizeSearchText(query))

export const formatDate = (value: string) => {
  if (!value) return '-'
  return new Intl.DateTimeFormat('ms-MY', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  }).format(new Date(`${value}T00:00:00`))
}
