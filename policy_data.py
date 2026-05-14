PROPOSAL_UPDATES = [
    {
        "topic": "Negative gearing restricted to new builds",
        "status": "Budget proposal",
        "effective": "From 1 July 2027",
        "summary": (
            "Residential property losses for affected established properties will no longer offset salary or wage income. "
            "Instead, losses will only offset other residential property income and residential property capital gains, with "
            "excess losses carried forward."
        ),
        "impact": (
            "This materially weakens the after-tax case for low-yield, highly leveraged established property. "
            "Yield, debt serviceability and genuine owner-occupier demand become much more important."
        ),
        "source_label": "Budget 2026-27 Tax Explainer",
        "source_url": "https://budget.gov.au/content/factsheets/download/tax-explainers-negative-gearing-capital-gains-tax.pdf",
    },
    {
        "topic": "Grandfathering and transition for established property",
        "status": "Budget proposal",
        "effective": "Announcement to 30 June 2027 transition",
        "summary": (
            "Properties already held at announcement are grandfathered. Established properties bought after the announcement "
            "can still be negatively geared until 30 June 2027, but not after that date."
        ),
        "impact": (
            "Existing investors are partly protected, but the bid for newly purchased established investment property should "
            "be weaker than under the old rules."
        ),
        "source_label": "Budget 2026-27 Tax Explainer",
        "source_url": "https://budget.gov.au/content/factsheets/download/tax-explainers-negative-gearing-capital-gains-tax.pdf",
    },
    {
        "topic": "CGT discount replaced for most individual assets",
        "status": "Budget proposal",
        "effective": "From 1 July 2027 on gains accruing after that date",
        "summary": (
            "The 50% CGT discount for individuals, trusts and partnerships will be replaced with CPI cost-base indexation "
            "and a 30% minimum tax on real capital gains."
        ),
        "impact": (
            "This hits both shares and property, so the reform is not simply 'bad for property, good for shares'. "
            "But it reduces the attractiveness of long-duration capital-growth-only strategies across the board."
        ),
        "source_label": "Budget 2026-27 Tax Explainer",
        "source_url": "https://budget.gov.au/content/factsheets/download/tax-explainers-negative-gearing-capital-gains-tax.pdf",
    },
    {
        "topic": "Transitional split for assets held before 1 July 2027",
        "status": "Budget proposal",
        "effective": "On disposal after 1 July 2027",
        "summary": (
            "For affected assets bought before 1 July 2027 and sold after that date, gains accrued before 1 July 2027 stay "
            "under the old regime, while gains accrued after that date move to the new regime."
        ),
        "impact": (
            "For investors buying now, there is still some value in the transition period, but the long-run tax regime is "
            "the more important issue."
        ),
        "source_label": "Budget 2026-27 Tax Explainer",
        "source_url": "https://budget.gov.au/content/factsheets/download/tax-explainers-negative-gearing-capital-gains-tax.pdf",
    },
    {
        "topic": "New build exemption is the key residential carve-out",
        "status": "Budget proposal",
        "effective": "Ongoing under proposal",
        "summary": (
            "New builds that genuinely add supply keep negative gearing, and investors can choose either the 50% CGT "
            "discount or indexation plus the minimum-tax regime on sale."
        ),
        "impact": (
            "This is the biggest reason the future residential market may split into tax-favoured supply-adding stock and "
            "tax-disadvantaged established investor stock."
        ),
        "source_label": "Budget 2026-27 Tax Explainer",
        "source_url": "https://budget.gov.au/content/factsheets/download/tax-explainers-negative-gearing-capital-gains-tax.pdf",
    },
    {
        "topic": "New build definition still matters a lot",
        "status": "Technical reading",
        "effective": "Likely implementation detail",
        "summary": (
            "Technical analysis suggests the practical dividing line will be whether the asset genuinely adds supply: "
            "off-the-plan new dwellings, construction on vacant land, or redevelopment that increases dwelling count "
            "should benefit; cosmetic upgrades and knock-down rebuilds with no net supply increase should not."
        ),
        "impact": (
            "The most attractive residential opportunities could shift toward duplex, townhouse, subdivision and low-rise "
            "infill strategies rather than generic existing houses."
        ),
        "source_label": "William Buck Federal Budget Analysis 2026",
        "source_url": "https://williambuck.com/tools/federal-budget-2026/negative-gearing/",
    },
]

FUTURE_OUTLOOK = [
    {
        "asset": "Established residential property",
        "future_view": "Weaker",
        "core_reason": "Tax shelter removed for new buyers after the transition period; losses are quarantined.",
        "who_it_suits": "Investors with strong non-tax reasons to own it: scarcity, owner-occupier demand, redevelopment optionality or already-solid yield.",
    },
    {
        "asset": "New builds that genuinely add supply",
        "future_view": "Relative winner",
        "core_reason": "Keeps negative gearing and a favourable CGT choice, making it the main tax-advantaged residential lane.",
        "who_it_suits": "Investors who can avoid oversupplied product and focus on good land content, build quality and real local demand.",
    },
    {
        "asset": "Australian shares / ETFs",
        "future_view": "More competitive",
        "core_reason": "CGT reform still applies, but shares do not depend on quarantined rental losses, stamp duty or illiquidity.",
        "who_it_suits": "Investors prioritising diversification, liquidity and scalable compounding with less balance-sheet stress.",
    },
    {
        "asset": "Commercial property",
        "future_view": "Potential relative winner",
        "core_reason": "Technical commentary suggests the residential negative gearing reform does not directly target commercial property.",
        "who_it_suits": "Investors comfortable with vacancy, tenant and asset-specific risk, and usually larger lot sizes or syndicate structures.",
    },
]

AREA_DIMENSIONS = {
    "supply_creation": "Benefits from new-supply exemption",
    "owner_occupier": "Owner-occupier demand depth",
    "yield": "Cash yield resilience",
    "scarcity": "Land scarcity and replacement difficulty",
    "oversupply": "Protection from oversupply",
    "access": "Access to jobs and infrastructure",
    "quality": "Build quality and low ongoing drag",
    "policy": "Resilience under the proposed regime",
}

AREA_PROFILES = [
    {
        "profile": "Boutique new townhouses / duplex projects in scarce infill suburbs",
        "type": "New build / genuine supply-adding infill",
        "scores": {
            "supply_creation": 9,
            "owner_occupier": 8,
            "yield": 6,
            "scarcity": 8,
            "oversupply": 8,
            "access": 9,
            "quality": 7,
            "policy": 9,
        },
        "notes": "Strongest when the project adds net dwellings in a supply-constrained suburb with real owner-occupier demand.",
    },
    {
        "profile": "Subdividable established blocks with duplex or townhouse potential",
        "type": "Established land with redevelopment optionality",
        "scores": {
            "supply_creation": 8,
            "owner_occupier": 8,
            "yield": 5,
            "scarcity": 8,
            "oversupply": 8,
            "access": 8,
            "quality": 6,
            "policy": 9,
        },
        "notes": "Likely to gain strategic value because the land can be converted into future tax-favoured stock that adds supply.",
    },
    {
        "profile": "Established family suburbs with strong schools, transport and land scarcity",
        "type": "Established houses / family demand",
        "scores": {
            "supply_creation": 3,
            "owner_occupier": 9,
            "yield": 6,
            "scarcity": 9,
            "oversupply": 9,
            "access": 8,
            "quality": 7,
            "policy": 7,
        },
        "notes": "Still defensible because owner-occupier demand can support prices even if investor tax support fades.",
    },
    {
        "profile": "Older boutique apartments in blue-chip suburbs",
        "type": "Established units / boutique stock",
        "scores": {
            "supply_creation": 2,
            "owner_occupier": 7,
            "yield": 7,
            "scarcity": 6,
            "oversupply": 7,
            "access": 9,
            "quality": 6,
            "policy": 7,
        },
        "notes": "More robust than generic investor units because they usually have better location, lower supply elasticity and stronger owner-occupier appeal.",
    },
    {
        "profile": "Regional service hubs with hospitals, universities and resilient rents",
        "type": "Established or newer stock / high-yield",
        "scores": {
            "supply_creation": 4,
            "owner_occupier": 6,
            "yield": 8,
            "scarcity": 5,
            "oversupply": 6,
            "access": 5,
            "quality": 6,
            "policy": 8,
        },
        "notes": "Yield matters more under the proposal, so stable service-centre rents may become relatively more valuable than pure tax-play capital growth.",
    },
    {
        "profile": "Outer greenfield house-and-land estates",
        "type": "New build / greenfield",
        "scores": {
            "supply_creation": 8,
            "owner_occupier": 6,
            "yield": 6,
            "scarcity": 3,
            "oversupply": 3,
            "access": 4,
            "quality": 7,
            "policy": 6,
        },
        "notes": "Tax settings help, but long-run returns can still be diluted by elastic land supply, long commutes and mediocre scarcity.",
    },
    {
        "profile": "New high-rise apartment precincts dominated by investors",
        "type": "New build / high-rise units",
        "scores": {
            "supply_creation": 7,
            "owner_occupier": 4,
            "yield": 5,
            "scarcity": 2,
            "oversupply": 2,
            "access": 8,
            "quality": 4,
            "policy": 4,
        },
        "notes": "These still get new-build benefits, but oversupply, high strata drag and weak land content can wipe out the tax advantage.",
    },
    {
        "profile": "Low-yield established investor stock in expensive suburbs",
        "type": "Established houses or units / investor-heavy",
        "scores": {
            "supply_creation": 1,
            "owner_occupier": 6,
            "yield": 3,
            "scarcity": 7,
            "oversupply": 6,
            "access": 7,
            "quality": 6,
            "policy": 3,
        },
        "notes": "This is the archetypal loser if the thesis depended on offsetting losses against salary while waiting for capital growth.",
    },
]
