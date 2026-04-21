import { supabase } from './supabaseClient'

const normalizeLevelValue = (value) =>
  String(value || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase()

const getFallbackLevelOrder = (value) => {
  const match = String(value || '').match(/(\d+)/)
  return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER
}

const getLevelMapping = (originalName, levelMappings = []) =>
  (levelMappings || []).find(
    (item) => normalizeLevelValue(item?.original_name) === normalizeLevelValue(originalName)
  )

export const getDisplayLevel = (originalName, levelMappings = []) => {
  const found = getLevelMapping(originalName, levelMappings)
  return found?.display_name || originalName
}

export const getDisplayClassLabel = (originalName, className, levelMappings = []) =>
  `${getDisplayLevel(originalName, levelMappings) || ''} ${String(className || '').trim()}`.trim()

export const sortLevelsByDisplayOrder = (levels = [], levelMappings = []) =>
  [...new Set((levels || []).filter(Boolean))].sort((a, b) => {
    const mappingA = getLevelMapping(a, levelMappings)
    const mappingB = getLevelMapping(b, levelMappings)

    const orderA = Number.isFinite(Number(mappingA?.sort_order))
      ? Number(mappingA.sort_order)
      : getFallbackLevelOrder(a)
    const orderB = Number.isFinite(Number(mappingB?.sort_order))
      ? Number(mappingB.sort_order)
      : getFallbackLevelOrder(b)

    if (orderA !== orderB) return orderA - orderB

    return getDisplayLevel(a, levelMappings).localeCompare(
      getDisplayLevel(b, levelMappings),
      'ms',
      { sensitivity: 'base', numeric: true }
    )
  })

export const fetchSchoolLevelLabels = async ({ schoolId, academicYear }) => {
  if (!schoolId || !academicYear) return []

  const { data, error } = await supabase
    .from('school_level_labels')
    .select('id, school_id, academic_year, level, original_name, display_name, sort_order, is_active')
    .eq('school_id', schoolId)
    .eq('academic_year', academicYear)
    .eq('is_active', true)
    .order('sort_order', { ascending: true })
    .order('display_name', { ascending: true })

  if (error) throw error

  return data || []
}