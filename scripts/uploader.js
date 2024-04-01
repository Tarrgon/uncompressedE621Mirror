chrome.runtime.onMessage.addListener(async (request, sender, sendResponse) => {
  const acceptableMimeTypes = ["image/png", "image/jpeg", "image/gif", "image/apng", "video/mp4", "video/webm"]

  const MAX_SIZE = 100 * 1024 * 1024
  const MAX_SIZE_GIF = 20 * 1024 * 1024

  let data = await chrome.storage.sync.get("key")
  if (!data.key) return
  let key = data.key

  let formData = new FormData()

  let i = 0


  for (let bin of request.binaryBlobs) {
    let blob = new Blob([new Uint8Array(bin.binary)], { type: bin.type })
    if (!acceptableMimeTypes.includes(blob.mimetype) || blob.size > MAX_SIZE || (blob.type == "image/gif" && blob.size > MAX_SIZE_GIF)) continue
    formData.append(`file-${i++}`, blob)
  }

  formData.append("source", request.source)

  console.log(`SENDING FILES FROM: ${request.source}`)

  await fetch(`https://yiff.today/upload_middleman?key=${key}`, {
    method: "POST",
    mode: "no-cors",
    body: formData
  })

  sendResponse()
})