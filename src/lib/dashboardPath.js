export const getDashboardPath = (profile) => {
  const isSchoolAdmin =
    profile?.is_school_admin === true ||
    profile?.role === 'school_admin' ||
    profile?.role === 'admin'

  return isSchoolAdmin ? '/dashboard' : '/home'
}