function wait(ms) {
  return new Promise(r => setTimeout(r, ms))
}

function waitForElm(selector, tester, context) {
  return new Promise((resolve) => {
    if (!context) context = document
    if (tester) {
      for (let ele of context.querySelectorAll(selector)) {
        if (tester(ele)) return resolve(ele)
      }
    } else {
      let ele = context.querySelector(selector)
      if (ele) return resolve(ele)
    }

    const observer = new MutationObserver(() => {
      if (tester) {
        for (let ele of context.querySelectorAll(selector)) {
          if (tester(ele)) {
            observer.disconnect()
            return resolve(ele)
          }
        }
      } else {
        let ele = context.querySelector(selector)
        if (ele) {
          observer.disconnect()
          return resolve(ele)
        }
      }
    })

    observer.observe(context, {
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

        mutation.target.querySelector("[aria-label='Cancel']").addEventListener("click", () => {
          currentBlobs.clear()
        })

        button.addEventListener("click", async (e) => {
          if (!enabled) return

          let data = await chrome.storage.sync.get("key")
          if (!data.key || currentBlobs.size == 0) return

          sendBlobs(currentBlobs.values().toArray(), "bluesky")

          currentBlobs.clear()
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

        document.body.addEventListener("drop", (e) => {
          nextFiles = Array.from(e.dataTransfer.files)
        }, true)
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

      button.addEventListener("click", async () => {
        let form = document.getElementById("myform")

        let selected = form.querySelector(".selected")

        if (!enabled || selected.firstElementChild.innerText.trim() != "Artwork") return

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

        sendBlobs(allBlobs, "furaffinity")
      })
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

async function deviantartObserver() {
  let enabled = (await chrome.storage.sync.get("enabled"))?.enabled ?? true

  const capturedCloseButtons = []
  const reactors = []
  const files = []
  const customButtons = []
  const capturedButtons = []
  const bodiesWithObservers = []
  const formsWithLiseners = []

  let currentActiveFrame = null

  let onChangeReactor = async () => {
    let doc = await waitForElm(".iframed_submitform.never-hide-me.loaded.active")
    if (currentActiveFrame == doc) return

    currentActiveFrame = doc

    while (!doc.contentWindow.document.body) await wait(500)

    if (!bodiesWithObservers.includes(doc.contentWindow.document.body)) {

      let grabForms = async () => {
        let form = await waitForElm("#stash-form", null, doc.contentWindow.document.body)
        let fileInput = await waitForElm("#stash-form > a > input", null, doc.contentWindow.document.body)

        if (!formsWithLiseners.includes(form)) {
          formsWithLiseners.push(form)

          fileInput.addEventListener("change", () => {
            files.push(...Array.from(fileInput.files))
          })

          form.addEventListener("drop", (e) => {
            files.push(...Array.from(e.dataTransfer.files))
          }, true)
        }
      }

      await grabForms()

      const bodyObserver = new MutationObserver(() => {
        grabForms()
      })

      bodyObserver.observe(doc.contentWindow.document.body, {
        childList: true,
        subtree: true
      })

      bodiesWithObservers.push(doc.contentWindow.document.body)
    }

    let buttons = [await waitForElm("button.ile-button.ile-heading-submit-button.ile-handicapped.ile-submit-button.smbutton.smbutton-green", null, doc.contentWindow.document.body),
    await waitForElm("button.ile-button.ile-heading-submit-button.ile-handicapped.ile-submit-button.bottom.smbutton.smbutton-green", null, doc.contentWindow.document.body)]

    for (let button of buttons) {
      if (capturedButtons.includes(button)) continue
      capturedButtons.push(button)

      let customButton = button.cloneNode(true)
      capturedButtons.push(customButton)

      customButton.firstElementChild.innerHTML = ""
      customButton.firstElementChild.innerText = `Mirror (${enabled ? "ON" : "OFF"})`
      customButton.firstElementChild.style.fontSize = "12.5px"
      button.before(customButton)

      button.addEventListener("click", async (e) => {
        if (!enabled) return

        let data = await chrome.storage.sync.get("key")
        if (!data.key) return

        let tabs = Array.from(document.querySelectorAll("li.submit-tab.loaded"))

        let activeTabIndex = tabs.findIndex(e => e.classList.contains("active"))

        for (let react of reactors) {
          react(activeTabIndex)
        }

        reactors.splice(activeTabIndex, 1)

        sendBlobs([files[activeTabIndex]], "deviantart")

        onChangeReactor()
      })

      customButton.addEventListener("click", async (e) => {
        e.preventDefault()
        e.stopImmediatePropagation()
        enabled = !enabled

        for (let b of customButtons)
          b.firstElementChild.innerText = `Mirror (${enabled ? "ON" : "OFF"})`

        await chrome.storage.sync.set({
          enabled: enabled
        })
      })

      customButtons.push(customButton)
    }
  }

  const observer = new MutationObserver(async (list) => {
    for (let mutation of list) {
      if (mutation.addedNodes.length > 0) {
        for (let node of mutation.addedNodes) {
          let closeTab = node.parentElement.querySelector(".submit-tab-close")
          if (closeTab && !capturedCloseButtons.includes(closeTab)) {
            closeTab.parentElement.addEventListener("click", () => {
              onChangeReactor()
            })

            capturedCloseButtons.push(closeTab)
            let tabs = Array.from(document.querySelectorAll("li.submit-tab"))
            let tabIndex = tabs.findIndex(e => e.contains(closeTab))

            let reactor = (index) => {
              if (index < tabIndex) tabIndex--
            }

            reactors.push(reactor)

            closeTab.addEventListener("click", () => {
              files.splice(tabIndex, 1)

              for (let react of reactors) {
                react(tabIndex)
              }

              reactors.splice(reactors.indexOf(reactor), 1)
            })
          }
        }
      }
    }
  })

  observer.observe(await waitForElm(".submit-tab-list"), {
    childList: true,
    subtree: true
  })

  onChangeReactor()
}

async function instagramObserver() {
  let enabled = (await chrome.storage.sync.get("enabled"))?.enabled ?? true

  const capturedInputs = []

  let nextFiles = []

  const observer = new MutationObserver(() => {
    for (let input of document.querySelectorAll("input[type='file'][accept='image/jpeg,image/png,image/heic,image/heif,video/mp4,video/quicktime']")) {
      if (capturedInputs.includes(input)) continue
      capturedInputs.push(input)
      input.addEventListener("change", () => {
        nextFiles = Array.from(input.files)
      })
    }

    for (let button of document.querySelectorAll("div[role='button']")) {
      if (button.innerText == "Share" && !capturedButtons.includes(button)) {
        capturedButtons.push(button)

        let customButton = button.cloneNode(true)
        customButton.innerText = `Mirror (${enabled ? "ON" : "OFF"})`
        button.before(customButton)
        capturedButtons.push(customButton)

        customButton.addEventListener("click", async () => {
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

          let allBlobs = []

          for (let image of nextFiles) {
            if (image.size >= 100 * 1024 * 1024) continue
            allBlobs.push(image)
          }

          if (allBlobs.length == 0) return

          sendBlobs(allBlobs, "instagram")
        })
      }
    }
  })

  observer.observe(document.body, {
    childList: true,
    subtree: true
  })
}

(() => {
  console.log("UNCOMPRESSED E621 MIRROR LOADED!")
  if (window.location.href.includes("x.com") || window.location.href.includes("twitter.com")) twitterObserver()
  else if (window.location.href.includes("bsky.app")) blueskyObserver()
  else if (window.location.href.includes("furaffinity.net")) furaffinityObserver()
  else if (window.location.href.includes("artstation.com")) artstationObserver()
  else if (window.location.href.includes("deviantart.com")) deviantartObserver()
  else if (window.location.href.includes("instagram.com")) instagramObserver()
})();