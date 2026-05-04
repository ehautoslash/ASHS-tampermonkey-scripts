// ==UserScript==
// @name         Hotel Email Scraper with AI
// @namespace    https://autoslash.local/
// @version      3.4.0
// @description  Detect Amex, Best Western, Capital One Travel, Chase Travel, Choice Hotels, Expedia, Hilton, Holiday Inn / IHG, Hyatt, Marriott, Wyndham, Booking.com (NOT WORKING), or Hotels.com confirmation emails in HelpScout, review extracted data, then fill the HotelSlash form. AI fallback via Gemini.
// @match        https://secure.helpscout.net/conversation/*
// @match        https://app.helpscout.com/*
// @match        https://admin.hotelslash.com/TrackingRequest/Edit
// @grant        GM_addStyle
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @grant        GM_listValues
// @grant        GM_xmlhttpRequest
// @grant        GM.xmlHttpRequest
// @grant        unsafeWindow
// @connect      generativelanguage.googleapis.com
// @require      config.js
// @run-at       document-idle
// ==/UserScript==
