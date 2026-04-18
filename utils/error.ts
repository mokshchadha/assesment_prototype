export const handleError = ({ error, set, code }: { error: any; set: any; code:any }) => {
  if (code === "VALIDATION") {
    set.status = 400
    return { error: error.message }
  }

  if (error?.message === "missing token" || error?.message === "invalid or expired token") {
    set.status = 401
    return { error: error.message }
  }

  console.error(error)
  set.status = 500
  return { error: "internal server error" }
}
