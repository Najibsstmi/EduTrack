import type { ClassificationOption } from '../types'

export const optionsByType = (options: ClassificationOption[], type: string) =>
  options
    .filter((option) => option.option_type === type)
    .sort((a, b) => a.sort_order - b.sort_order)

export const optionLabel = (
  options: ClassificationOption[],
  type: string,
  value: string
) => options.find((option) => option.option_type === type && option.value === value)?.label || value
