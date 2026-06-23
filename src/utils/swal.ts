import Swal, { type SweetAlertIcon } from 'sweetalert2'

// Default styling settings
const defaultConfirmColor = '#0f172a' // slate-900
const dangerConfirmColor = '#ef4444' // red-500
const cancelColor = '#64748b' // slate-500

export const swalAlert = (icon: SweetAlertIcon, title: string, text?: string) => {
  return Swal.fire({
    icon,
    title,
    text,
    confirmButtonColor: defaultConfirmColor
  })
}

export const swalSuccess = (title: string, text?: string) => swalAlert('success', title, text)
export const swalError = (title: string, text?: string) => swalAlert('error', title, text)
export const swalInfo = (title: string, text?: string) => swalAlert('info', title, text)

export const swalConfirm = async (
  title: string, 
  text: string, 
  options?: {
    confirmText?: string,
    cancelText?: string,
    isDanger?: boolean
  }
): Promise<boolean> => {
  const result = await Swal.fire({
    title,
    text,
    icon: 'warning',
    showCancelButton: true,
    confirmButtonColor: options?.isDanger ? dangerConfirmColor : defaultConfirmColor,
    cancelButtonColor: cancelColor,
    confirmButtonText: options?.confirmText || 'Yes',
    cancelButtonText: options?.cancelText || 'Cancel'
  })
  return result.isConfirmed
}

export const swalPrompt = async (
  title: string,
  text: string,
  expectedInput: string,
  options?: {
    confirmText?: string,
    cancelText?: string,
    isDanger?: boolean
  }
): Promise<boolean> => {
  const result = await Swal.fire({
    title,
    text,
    icon: 'warning',
    input: 'text',
    inputPlaceholder: `Type "${expectedInput}" to confirm`,
    showCancelButton: true,
    confirmButtonColor: options?.isDanger ? dangerConfirmColor : defaultConfirmColor,
    cancelButtonColor: cancelColor,
    confirmButtonText: options?.confirmText || 'Confirm',
    cancelButtonText: options?.cancelText || 'Cancel',
    preConfirm: (inputValue) => {
      if (inputValue !== expectedInput) {
        Swal.showValidationMessage(`You must type "${expectedInput}"`)
        return false
      }
      return true
    }
  })
  return result.isConfirmed
}

export const swalToast = (title: string, icon: SweetAlertIcon = 'success', timer = 2000) => {
  return Swal.fire({
    toast: true,
    position: 'top-end',
    showConfirmButton: false,
    timer,
    timerProgressBar: true,
    icon,
    title,
    didOpen: (toast) => {
      toast.addEventListener('mouseenter', Swal.stopTimer)
      toast.addEventListener('mouseleave', Swal.resumeTimer)
    }
  })
}
