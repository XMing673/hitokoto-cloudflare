import a from "../sentences/a.json";
import b from "../sentences/b.json";
import c from "../sentences/c.json";
import d from "../sentences/d.json";
import e from "../sentences/e.json";
import f from "../sentences/f.json";
import g from "../sentences/g.json";
import h from "../sentences/h.json";
import i from "../sentences/i.json";
import j from "../sentences/j.json";
import k from "../sentences/k.json";
import l from "../sentences/l.json";

const sentencesMap = {
    a,
    b,
    c,
    d,
    e,
    f,
    g,
    h,
    i,
    j,
    k,
    l,
};

const responseHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    "X-Content-Type-Options": "nosniff",
    "X-Source-Code": "https://github.com/molikai-work/hitokoto-cloudflare",
};

const CALLBACK_PATTERN = /^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*$/;

function createResponse(code, message, extraData = {}, extraHeaders = {}) {
    return Response.json({
        code,
        message,
        timestamp: Date.now(),
        ...extraData,
    }, {
        headers: {
            ...extraHeaders,
            ...responseHeaders,
        },
        status: code,
    });
}

function handleError(code, error, devEnv, customMessage = "服务器内部错误") {
    if (devEnv === "true") {
        return createResponse(code, error.message);
    }

    return createResponse(code, customMessage);
}

function isValidPositiveInteger(value) {
    return Number.isInteger(value) && value > 0;
}

function isValidCallbackName(callback) {
    return CALLBACK_PATTERN.test(callback);
}

function getSentencesByCategory(categoryKey) {
    if (!categoryKey) {
        return null;
    }

    return sentencesMap[categoryKey] || null;
}

function getRandomCategorySentences() {
    const keys = Object.keys(sentencesMap);
    const randomKey = keys[Math.floor(Math.random() * keys.length)];
    return sentencesMap[randomKey];
}

function buildResponsePayload(sentence) {
    return {
        id: sentence.id,
        uuid: sentence.uuid,
        hitokoto: sentence.hitokoto,
        type: sentence.type,
        from: sentence.from,
        from_who: sentence.from_who,
        creator: sentence.creator,
        creator_uid: sentence.creator_uid,
        reviewer: sentence.reviewer,
        commit_from: sentence.commit_from,
        created_at: sentence.created_at,
        length: sentence.length,
    };
}

function buildJavascriptResponse(sentence, selector) {
    const hitokotoText = JSON.stringify(sentence.hitokoto);
    const selectorText = JSON.stringify(selector || ".hitokoto");

    return `(function hitokoto(){var hitokoto=${hitokotoText};var selector=${selectorText};try{var dom=document.querySelector(selector);if(dom){dom.innerText=hitokoto;}}catch(error){}})()`;
}

export async function onRequest(context) {
    const { request, env } = context;

    try {
        if (request.method === "OPTIONS") {
            return new Response(null, {
                headers: {
                    ...responseHeaders,
                },
            });
        }

        const url = new URL(request.url);
        const categoryKey = url.searchParams.get("c");
        const encodeType = url.searchParams.get("encode");
        const callback = url.searchParams.get("callback");
        const select = url.searchParams.get("select");

        const minLength = url.searchParams.has("min_length")
            ? Number.parseInt(url.searchParams.get("min_length"), 10)
            : 0;
        const maxLength = url.searchParams.has("max_length")
            ? Number.parseInt(url.searchParams.get("max_length"), 10)
            : 30;

        if (url.searchParams.has("min_length") && !isValidPositiveInteger(minLength)) {
            return createResponse(400, "min_length 必须是正整数");
        }

        if (url.searchParams.has("max_length") && !isValidPositiveInteger(maxLength)) {
            return createResponse(400, "max_length 必须是正整数");
        }

        if (maxLength < minLength) {
            return createResponse(400, "max_length 不能小于 min_length");
        }

        if (callback && !isValidCallbackName(callback)) {
            return createResponse(400, "callback 格式无效");
        }

        let sentences = getSentencesByCategory(categoryKey) || getRandomCategorySentences();

        if (minLength || maxLength) {
            if (categoryKey) {
                sentences = getSentencesByCategory(categoryKey) || [];
            } else {
                sentences = Object.values(sentencesMap).flat();
            }

            sentences = sentences.filter((sentence) => {
                const isMinLengthValid = !minLength || sentence.length >= minLength;
                const isMaxLengthValid = !maxLength || sentence.length <= maxLength;
                return isMinLengthValid && isMaxLengthValid;
            });

            if (sentences.length === 0) {
                if (categoryKey) {
                    return createResponse(404, "没有在该类别找到符合长度条件的一言");
                }

                return createResponse(404, "没有找到符合长度条件的一言");
            }
        }

        const randomSentence = sentences[Math.floor(Math.random() * sentences.length)];
        const response = buildResponsePayload(randomSentence);

        if (encodeType === "text") {
            const responseContent = callback
                ? `;${callback}(${JSON.stringify(randomSentence.hitokoto)});`
                : randomSentence.hitokoto;
            const contentType = callback ? "application/javascript" : "text/plain";

            return new Response(responseContent, {
                headers: {
                    "Content-Type": `${contentType}; charset=UTF-8`,
                    ...responseHeaders,
                },
            });
        }

        if (encodeType === "js") {
            const jsContent = buildJavascriptResponse(randomSentence, select);
            const finalContent = callback
                ? `;${callback}(${JSON.stringify(jsContent)});`
                : jsContent;

            return new Response(finalContent, {
                headers: {
                    "Content-Type": "application/javascript; charset=UTF-8",
                    ...responseHeaders,
                },
            });
        }

        if ((!encodeType || encodeType === "json") && callback) {
            const jsonResponse = JSON.stringify(response);
            const jsonCallbackContent = `;${callback}(${JSON.stringify(jsonResponse)});`;

            return new Response(jsonCallbackContent, {
                headers: {
                    "Content-Type": "application/javascript; charset=UTF-8",
                    ...responseHeaders,
                },
            });
        }

        return Response.json(response, {
            headers: {
                "Content-Type": "application/json; charset=UTF-8",
                ...responseHeaders,
            },
        });
    } catch (error) {
        console.error("Unexpected error:", error);
        return handleError(500, error, env.DEV_ENV);
    }
}
