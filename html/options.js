document.addEventListener('DOMContentLoaded', async () => {
  const data = await chrome.storage.sync.get("key")
  if (data.key) document.getElementById("key").value = data.key
})

document.getElementById('save').addEventListener('click', async () => {
  await chrome.storage.sync.set({
    key: document.getElementById("key").value
  })

  alert("Key set")
})