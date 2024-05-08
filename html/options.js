document.addEventListener('DOMContentLoaded', async () => {
  const data = await chrome.storage.sync.get(["key", "allowedUploaders"])
  if (data.key) document.getElementById("key").value = data.key
  if (data.allowedUploaders) document.getElementById("allowed-uploaders").value = data.allowedUploaders.join(" ")
})

document.getElementById('save').addEventListener('click', async () => {
  await chrome.storage.sync.set({
    key: document.getElementById("key").value,
    allowedUploaders: document.getElementById("allowed-uploaders").value.split(" ")
  })

  let key = document.getElementById("key").value
  let allowedUploaders = document.getElementById("allowed-uploaders").value.split(" ").filter(a => a)

  if (key) {
    await fetch(`https://yiff.today/upload_middleman?key=${key}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ allowedUploaders })
    })
  }

  alert("Saved")
})