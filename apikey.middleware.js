const acceptableKey = process.env.APIKEY || "H13lVMfsxaNfNMmb9a1R8ZtDvUmKzk6"

exports.apiKeyNeeded = (req,res,next) => {
    const {apiKey} = req.query

    if(apiKey && apiKey===acceptableKey){
        req.apiUser = "Generic"
        return next();
    }

    return res.status(403).send();
}