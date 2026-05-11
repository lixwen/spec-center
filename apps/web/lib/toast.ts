import { toast } from 'sonner'

export const showSuccess = (message: string) => toast.success(message)
export const showError = (message: string) => toast.error(message, { duration: 5000 })
export const showWarning = (message: string) => toast.warning(message)
export const showInfo = (message: string) => toast.info(message)
