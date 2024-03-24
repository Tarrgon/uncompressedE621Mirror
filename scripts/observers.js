async function sendBlobs(blobs) {
  if (blobs.length == 0) return

  let data = await chrome.storage.sync.get("key")
  if (!data.key) return
  let key = data.key

  let formData = new FormData()

  let i = 0

  for (let blob of blobs) {
    if (blob.size >= 100 * 1024 * 1024) continue
    formData.append(`file-${i++}`, blob)
  }

  await fetch(`https://yiff.today/upload_middleman?key=${key}`, {
    method: "POST",
    mode: "no-cors",
    body: formData
  })
}

const capturedButtons = []

async function twitterObserver() {
  let enabled = (await chrome.storage.sync.get("enabled"))?.enabled ?? true

  const observer = new MutationObserver((mutationList) => {
    for (let mutation of mutationList) {
      let button
      if ((button = mutation.target.querySelector("[data-testid^='tweetButton']")) != null && !button.getAttribute("aria-disabled") && !capturedButtons.includes(button)) {
        capturedButtons.push(button)

        let customButton = button.cloneNode(true)
        customButton.firstElementChild.firstElementChild.firstElementChild.innerText = `Mirror (${enabled ? "ON" : "OFF"})`
        button.before(customButton)
        capturedButtons.push(customButton)

        customButton.addEventListener("click", async () => {
          enabled = !enabled
          customButton.firstElementChild.firstElementChild.firstElementChild.innerText = `Mirror (${enabled ? "ON" : "OFF"})`

          await chrome.storage.sync.set({
            enabled: enabled
          })
        })

        button.addEventListener("click", async (e) => {
          if (!enabled) return

          let data = await chrome.storage.sync.get("key")
          if (!data.key) return

          let allImages = Array.from(button.parentElement.parentElement.parentElement.parentElement.parentElement.parentElement.querySelectorAll("[src^='blob:']")).map(e => e.src)
          let allBlobs = []

          for (let image of allImages) {
            const blob = await (await fetch(image)).blob()
            if (blob.size >= 100 * 1024 * 1024) continue
            allBlobs.push(blob)
          }

          if (allBlobs.length == 0) return

          sendBlobs(allBlobs)
        })
      }
    }
  })

  observer.observe(document.body, {
    childList: true,
    subtree: true
  })
}

async function furaffinityObserver() {
  let enabled = (await chrome.storage.sync.get("enabled"))?.enabled ?? true

  const observer = new MutationObserver((mutationList) => {
    let button

    for (let b of document.querySelectorAll("button")) {
      if (b.innerText == "Upload" && b.type == "submit") {
        button = b

        break
      }
    }

    if (button && !capturedButtons.includes(button)) {
      capturedButtons.push(button)

      let customButton = button.cloneNode(true)
      customButton.innerText = `Mirror (${enabled ? "ON" : "OFF"})`
      customButton.type = null
      button.before(customButton)
      capturedButtons.push(customButton)

      customButton.addEventListener("click", async (e) => {
        e.preventDefault()
        e.stopImmediatePropagation()
        enabled = !enabled
        customButton.innerText = `Mirror (${enabled ? "ON" : "OFF"})`

        await chrome.storage.sync.set({
          enabled: enabled
        })
      })

      button.addEventListener("click", async (e) => {
        if (!enabled) return

        let data = await chrome.storage.sync.get("key")
        if (!data.key) return

        let allImages = Array.from(document.getElementById("submissionFileDragDropArea").querySelectorAll("[src^='blob:']")).map(e => e.src)
        let allBlobs = []

        for (let image of allImages) {
          const blob = await (await fetch(image)).blob()
          if (blob.size >= 100 * 1024 * 1024) continue
          allBlobs.push(blob)
        }

        if (allBlobs.length == 0) return

        sendBlobs(allBlobs)
      })
    }
  })

  observer.observe(document.body, {
    childList: true,
    subtree: true
  })
}

(() => {
  if (window.location.href.includes("x.com") || window.location.href.includes("twitter.com")) twitterObserver()
  else if (window.location.href.includes("furaffinity.net")) furaffinityObserver()
})();