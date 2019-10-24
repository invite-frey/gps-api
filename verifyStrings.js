const verifyDateString = dateString => typeof dateString !== undefined && dateString !== null && !isNaN(new Date(dateString).getTime());

module.exports = {
    verifyUnitId: id => typeof id === 'string' && id.length > 10,
    verifyDateString: verifyDateString,
    verifiedDateStringOrNull: dateString => dateString && verifyDateString(dateString) ? dateString : null
}


