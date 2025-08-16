# findtorontopcp
find local doctors by distance

using this api

curl 'https://register.cpso.on.ca/Get-Search-Results/' \
>   -H 'accept: */*' \
>   -H 'accept-language: en-US,en;q=0.9,zh-CN;q=0.8,zh;q=0.7' \
>   -H 'content-type: application/x-www-form-urlencoded; charset=UTF-8' \
>   -b 'Dynamics365PortalAnalytics=hwbI9IhtOFZ_6vx9S9IQ4KwcrM-scrRFvynnyosAX4ziBlCSKB1CDtQazU5rRTzgVuCUnA2IOmnimX1zwXD4iEXNWhf2wCnb0Q-90PApIlfPcJJPPTKn54egRRlk48KxkZPFI-0v_gUrajXVAOVHiQ2; _ga=GA1.1.1307240706.1754765790; timezoneoffset=420; isDSTSupport=true; isDSTObserved=true; ContextLanguageCode=en-US; _clck=h92ihy%7C2%7Cfyb%7C0%7C2047; timeZoneCode=5; _ga_ZRCCDF4GCQ=GS2.1.s1754779194$o2$g0$t1754779194$j60$l0$h0; ARRAffinity=778dfe68ccfb9d96be57f2be2d452ca51e5e6a3c3d5f01ded1c44784ae5a5f31; ARRAffinitySameSite=778dfe68ccfb9d96be57f2be2d452ca51e5e6a3c3d5f01ded1c44784ae5a5f31' \
>   -H 'origin: https://register.cpso.on.ca' \
>   -H 'priority: u=1, i' \
>   -H 'referer: https://register.cpso.on.ca/Search-Results/' \
>   -H 'request-id: |7f3e2fe8e979490ea20f8efef046dbf1.fe346bc548e54e98' \
>   -H 'sec-ch-ua: "Not)A;Brand";v="8", "Chromium";v="138", "Google Chrome";v="138"' \
>   -H 'sec-ch-ua-mobile: ?0' \
>   -H 'sec-ch-ua-platform: "macOS"' \
>   -H 'sec-fetch-dest: empty' \
>   -H 'sec-fetch-mode: cors' \
>   -H 'sec-fetch-site: same-origin' \
>   -H 'traceparent: 00-7f3e2fe8e979490ea20f8efef046dbf1-fe346bc548e54e98-01' \
>   -H 'user-agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36' \
>   -H 'x-requested-with: XMLHttpRequest' \
>   --data-raw 'cbx-includeinactive=on&postalCode=M2N+4&doctorType=Any&LanguagesSelected=ENGLISH'
