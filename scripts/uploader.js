chrome.runtime.onMessage.addListener(async (request, sender, sendResponse) => {
  let data = await chrome.storage.sync.get("key")
  if (!data.key) return
  let key = data.key

  let formData = new FormData()

  let i = 0


  for (let bin of request.binaryBlobs) {
    let blob = new Blob([new Uint8Array(bin.binary)], {type: bin.type})
    if (blob.size >= 100 * 1024 * 1024) continue
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