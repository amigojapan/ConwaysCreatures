display.setStatusBar(display.HiddenStatusBar)

local centerX = display.contentCenterX
local centerY = display.contentCenterY
local screenW = display.contentWidth
local screenH = display.contentHeight

local resultText = display.newText({
    text = "Tap to Scan QR",
    x = centerX,
    y = 80,
    width = screenW - 20,
    font = native.systemFontBold,
    fontSize = 22,
    align = "center"
})

resultText:setFillColor(1)

local webView

local function webListener(event)

    if event.type == "loaded" then
        print("WebView loaded")
    end

    if event.url and string.sub(event.url, 1, 11) == "solar2d://" then

        local qrData = string.sub(event.url, 12)
        qrData = url.unescape(qrData)

        resultText.text = qrData

        if webView then
            webView:removeSelf()
            webView = nil
        end

        return false
    end

    return true
end

local function openScanner()

    if webView then
        webView:removeSelf()
        webView = nil
    end

    webView = native.newWebView(
        display.contentCenterX,
        display.contentCenterY,
        display.actualContentWidth,
        display.actualContentHeight
    )

    webView:request("qr.html", system.ResourceDirectory)
    webView:addEventListener("urlRequest", webListener)
end
resultText:addEventListener("tap", openScanner)