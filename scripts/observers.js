function waitForElm(selector, tester) {
  return new Promise((resolve) => {
    if (tester) {
      for (let ele of document.querySelectorAll(selector)) {
        if (tester(ele)) return resolve(ele)
      }
    } else {
      let ele = document.querySelector(selector)
      if (ele) return resolve(ele)
    }

    const observer = new MutationObserver(() => {
      if (tester) {
        for (let ele of document.querySelectorAll(selector)) {
          if (tester(ele)) {
            observer.disconnect()
            return resolve(ele)
          }
        }
      } else {
        let ele = document.querySelector(selector)
        if (ele) {
          observer.disconnect()
          return resolve(ele)
        }
      }
    })

    observer.observe(document.body, {
      childList: true,
      subtree: true
    })
  })
}

async function sendBlobs(blobs, source) {
  if (blobs.length == 0) return

  let data = await chrome.storage.sync.get("key")
  if (!data.key) return

  let binaryBlobs = []

  for (let blob of blobs) {
    if (blob.size >= 100 * 1024 * 1024) continue
    binaryBlobs.push({ binary: [...new Uint8Array(await blob.arrayBuffer())], type: blob.type })
  }

  chrome.runtime.sendMessage({ binaryBlobs, source })
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

          sendBlobs(allBlobs, "twitter")
        })
      }
    }
  })

  observer.observe(document.body, {
    childList: true,
    subtree: true
  })
}

async function blueskyObserver() {
  let enabled = (await chrome.storage.sync.get("enabled"))?.enabled ?? true

  let currentBlobs = new Map()

  const observer = new MutationObserver((mutationList) => {
    for (let mutation of mutationList) {
      let button
      if ((button = mutation.target.querySelector("[aria-label='Publish post']")) != null && !capturedButtons.includes(button)) {
        capturedButtons.push(button)

        let customButton = button.cloneNode(true)
        customButton.firstElementChild.firstElementChild.innerText = `Mirror (${enabled ? "ON" : "OFF"})`
        button.before(customButton)
        capturedButtons.push(customButton)

        customButton.addEventListener("click", async () => {
          enabled = !enabled
          customButton.firstElementChild.firstElementChild.innerText = `Mirror (${enabled ? "ON" : "OFF"})`

          await chrome.storage.sync.set({
            enabled: enabled
          })
        })

        button.addEventListener("click", async (e) => {
          if (!enabled) return

          let data = await chrome.storage.sync.get("key")
          if (!data.key || currentBlobs.size == 0) return

          sendBlobs(currentBlobs.values().toArray(), "bluesky")
        })

        let capturedInputs = []

        let nextFiles = []

        const fileInputObserver = new MutationObserver((list) => {
          for (let mutation of list) {
            if (mutation.addedNodes.length > 0 && !capturedInputs.includes(mutation.addedNodes[0]) &&
              mutation.addedNodes[0].nodeName == "INPUT" && mutation.addedNodes[0].type == "file" && mutation.addedNodes[0].style.display == "none") {
              mutation.addedNodes[0].addEventListener("change", () => {
                nextFiles = Array.from(mutation.addedNodes[0].files)
              })
            }
          }
        })  

        fileInputObserver.observe(document.body, {
          childList: true,
          subtree: false
        })

        let topParent = null

        const newFileObserver = new MutationObserver((list) => {
          for (let mutation of list) {
            if (mutation.addedNodes.length > 0) {
              for (let node of mutation.addedNodes) {
                if (node.nodeName == "DIV" && node.parentElement.getAttribute("data-expoimage") == "true") {
                  if (currentBlobs.has(node.parentNode.parentNode)) continue
                  if (topParent == null) topParent = node.parentNode.parentNode.parentNode.parentNode
                  currentBlobs.set(node.parentNode.parentNode, nextFiles.shift())
                }
              }
            } else if (mutation.removedNodes.length > 0) {
              if (mutation.target == topParent && topParent.childNodes.length == 0) {
                currentBlobs.clear()
                continue
              }
              let blobNodes = currentBlobs.keys().toArray()
              for (let node of mutation.removedNodes) {
                for (let blobNode of blobNodes) {
                  if (blobNode == node || node.contains(blobNode)) {
                    currentBlobs.delete(node)
                    break
                  }
                }
              }
            }
          }
        })

        newFileObserver.observe(document.querySelector("[data-testid='composePostView']"), {
          childList: true,
          subtree: true
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

      button.addEventListener("click",)
    }
  })

  observer.observe(document.body, {
    childList: true,
    subtree: true
  })
}

async function artstationObserver() {
  let enabled = (await chrome.storage.sync.get("enabled"))?.enabled ?? true

  let currentBlobs = new Map()

  let handler = async (e) => {
    if (!enabled) return

    let data = await chrome.storage.sync.get("key")
    if (!data.key) return

    if (currentBlobs.size == 0) return

    sendBlobs(currentBlobs.values().toArray(), "artstation")
  }

  let save = await waitForElm(".btn", (e) => e.innerText == "Save")
  let publish = await waitForElm(".btn", (e) => e.innerText == "Publish")

  let customButton = save.cloneNode(true)
  customButton.innerHTML = ""
  customButton.innerText = `Mirror (${enabled ? "ON" : "OFF"})`
  customButton.type = null
  save.before(customButton)

  customButton.addEventListener("click", async (e) => {
    e.preventDefault()
    e.stopImmediatePropagation()
    enabled = !enabled
    customButton.innerText = `Mirror (${enabled ? "ON" : "OFF"})`

    await chrome.storage.sync.set({
      enabled: enabled
    })
  })

  save.addEventListener("click", handler)
  publish.addEventListener("click", handler)

  const observer = new MutationObserver(async () => {
    let assets = document.querySelectorAll("project-asset")
    for (let asset of assets) {
      if (currentBlobs.has(asset)) continue
      let url = asset.querySelector(".asset-download > a").href
      if (url.startsWith("unsafe")) continue
      currentBlobs.set(asset, await (await fetch(url)).blob())

      let removeButton = asset.querySelector(".btn-blank.remove")
      removeButton.addEventListener("click", () => {
        if (asset.parentElement != null) return
        currentBlobs.delete(asset)
      })
    }
  })

  observer.observe(document.body, {
    childList: true,
    subtree: true
  })
}

(() => {
  console.log("EXTENSION LOADED!")
  if (window.location.href.includes("x.com") || window.location.href.includes("twitter.com")) twitterObserver()
  else if (window.location.href.includes("bsky.app")) blueskyObserver()
  else if (window.location.href.includes("furaffinity.net")) furaffinityObserver()
  else if (window.location.href.includes("artstation.com")) artstationObserver()
})();