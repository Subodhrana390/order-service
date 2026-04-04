export var PackType;
(function (PackType) {
    PackType["STRIP"] = "STRIP";
    PackType["BOTTLE"] = "BOTTLE";
    PackType["TUBE"] = "TUBE";
    PackType["VIAL"] = "VIAL";
    PackType["AMPOULE"] = "AMPOULE";
    PackType["SACHET"] = "SACHET";
    PackType["BOX"] = "BOX";
    PackType["CARTRIDGE"] = "CARTRIDGE";
})(PackType || (PackType = {}));
export var ConsumptionUnit;
(function (ConsumptionUnit) {
    ConsumptionUnit["TABLET"] = "TABLET";
    ConsumptionUnit["CAPSULE"] = "CAPSULE";
    ConsumptionUnit["ML"] = "ML";
    ConsumptionUnit["GM"] = "GM";
    ConsumptionUnit["IU"] = "IU";
    ConsumptionUnit["PUFF"] = "PUFF";
    ConsumptionUnit["PATCH"] = "PATCH";
    ConsumptionUnit["UNIT"] = "UNIT";
})(ConsumptionUnit || (ConsumptionUnit = {}));
export var LedgerEntryType;
(function (LedgerEntryType) {
    LedgerEntryType["INWARD"] = "INWARD";
    LedgerEntryType["ORDER_ACCEPTED"] = "ACCEPTED";
    LedgerEntryType["ORDER_DELIVERED"] = "DELIVERED";
    LedgerEntryType["ORDER_CANCELLED"] = "CANCELLED";
    LedgerEntryType["ADJUSTMENT"] = "ADJUSTMENT";
    LedgerEntryType["DAMAGE"] = "DAMAGE";
    LedgerEntryType["EXPIRY_REMOVAL"] = "EXPIRY_REMOVAL";
    LedgerEntryType["AUDIT_ADJUSTMENT"] = "AUDIT_ADJUSTMENT";
    LedgerEntryType["RETURN_TO_SUPPLIER"] = "RETURN_TO_SUPPLIER";
    LedgerEntryType["MANUAL_ADDITION"] = "MANUAL_ADDITION";
})(LedgerEntryType || (LedgerEntryType = {}));
export var ShopProductCategory;
(function (ShopProductCategory) {
    ShopProductCategory["MEDICINE"] = "MEDICINE";
    ShopProductCategory["WELLNESS"] = "WELLNESS";
    ShopProductCategory["DEVICE"] = "DEVICE";
    ShopProductCategory["FIRST_AID"] = "FIRST_AID";
    ShopProductCategory["PERSONAL_CARE"] = "PERSONAL_CARE";
    ShopProductCategory["ELDERLY_CARE"] = "ELDERLY_CARE";
    ShopProductCategory["DIAGNOSTICS"] = "DIAGNOSTICS";
})(ShopProductCategory || (ShopProductCategory = {}));
