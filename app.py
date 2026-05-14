from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List

import pandas as pd
import streamlit as st

from policy_data import AREA_DIMENSIONS, AREA_PROFILES, FUTURE_OUTLOOK, PROPOSAL_UPDATES


TRANSITION_YEARS = 1.13


@dataclass
class StrategyResult:
    name: str
    ending_wealth: float
    year_one_cashflow: float
    average_cashflow: float
    exit_tax: float
    total_tax_relief: float
    initial_outlay: float
    explanation: str


def money(value: float) -> str:
    return f"${value:,.0f}"


def pct(value: float) -> str:
    return f"{value * 100:.1f}%"


def render_wrapped_table(dataframe: pd.DataFrame) -> None:
    table_html = dataframe.to_html(index=False, escape=False)
    st.markdown(
        """
        <style>
        .wrapped-table {
            overflow-x: auto;
        }
        .wrapped-table table {
            width: max-content;
            min-width: 100%;
            table-layout: auto;
            border-collapse: collapse;
        }
        .wrapped-table th,
        .wrapped-table td {
            white-space: normal !important;
            word-break: break-word;
            overflow-wrap: anywhere;
            vertical-align: top;
            text-align: left;
            padding: 0.5rem 0.625rem;
        }
        </style>
        """,
        unsafe_allow_html=True,
    )
    st.markdown(f'<div class="wrapped-table">{table_html}</div>', unsafe_allow_html=True)


def compound_cashflows(cashflows: List[float], reinvest_rate: float) -> float:
    total = 0.0
    years = len(cashflows)
    for index, cashflow in enumerate(cashflows):
        total += cashflow * ((1 + reinvest_rate) ** (years - index - 1))
    return total


def current_cgt_tax(nominal_gain: float, marginal_tax_rate: float) -> float:
    return max(nominal_gain, 0.0) * 0.5 * marginal_tax_rate


def proposed_cgt_tax(real_gain: float, marginal_tax_rate: float) -> float:
    return max(real_gain, 0.0) * max(marginal_tax_rate, 0.30)


def proposed_real_gain(cost_base: float, exit_value: float, years: float, inflation_rate: float) -> float:
    indexed_cost = cost_base * ((1 + inflation_rate) ** max(years, 0.0))
    return max(exit_value - indexed_cost, 0.0)


def sale_tax_for_asset(
    *,
    cost_base: float,
    exit_value: float,
    annual_growth: float,
    holding_years: int,
    inflation_rate: float,
    marginal_tax_rate: float,
    acquisition_timing: str,
    eligible_new_build: bool,
) -> float:
    if acquisition_timing == "Buy after 1 July 2027":
        real_gain = proposed_real_gain(cost_base, exit_value, holding_years, inflation_rate)
        proposed_tax = proposed_cgt_tax(real_gain, marginal_tax_rate)
        if eligible_new_build:
            nominal_gain = max(exit_value - cost_base, 0.0)
            return min(proposed_tax, current_cgt_tax(nominal_gain, marginal_tax_rate))
        return proposed_tax

    pre_years = min(TRANSITION_YEARS, float(holding_years))
    post_years = max(float(holding_years) - pre_years, 0.0)
    pre_reform_value = cost_base * ((1 + annual_growth) ** pre_years)
    pre_reform_gain = max(pre_reform_value - cost_base, 0.0)
    pre_reform_tax = current_cgt_tax(pre_reform_gain, marginal_tax_rate)

    if post_years <= 0:
        return pre_reform_tax

    post_reform_real_gain = proposed_real_gain(pre_reform_value, exit_value, post_years, inflation_rate)
    post_reform_tax = proposed_cgt_tax(post_reform_real_gain, marginal_tax_rate)

    if eligible_new_build:
        total_nominal_gain = max(exit_value - cost_base, 0.0)
        legacy_tax = current_cgt_tax(total_nominal_gain, marginal_tax_rate)
        return min(legacy_tax, pre_reform_tax + post_reform_tax)

    return pre_reform_tax + post_reform_tax


def model_property(
    *,
    strategy_name: str,
    property_price: float,
    deposit_pct: float,
    purchase_cost_pct: float,
    selling_cost_pct: float,
    interest_rate: float,
    gross_yield_pct: float,
    rental_growth_pct: float,
    capital_growth_pct: float,
    non_interest_cost_pct: float,
    marginal_tax_rate: float,
    holding_years: int,
    reinvest_rate: float,
    inflation_rate: float,
    acquisition_timing: str,
    eligible_new_build: bool,
) -> StrategyResult:
    deposit = property_price * deposit_pct
    purchase_costs = property_price * purchase_cost_pct
    loan_balance = property_price - deposit
    initial_outlay = deposit + purchase_costs

    property_value = property_price
    annual_rent = property_price * gross_yield_pct
    carry_forward_loss = 0.0
    cashflows: List[float] = []
    total_tax_relief = 0.0

    for year in range(holding_years):
        interest_cost = loan_balance * interest_rate
        non_interest_costs = property_value * non_interest_cost_pct
        taxable_income = annual_rent - interest_cost - non_interest_costs

        can_offset_salary = eligible_new_build or (
            acquisition_timing == "Buy now (announcement to 30 June 2027)" and year == 0
        )

        if can_offset_salary:
            tax_effect = -taxable_income * marginal_tax_rate
            total_tax_relief += max(tax_effect, 0.0)
        else:
            if taxable_income >= 0:
                taxable_after_losses = max(taxable_income - carry_forward_loss, 0.0)
                carry_forward_loss = max(carry_forward_loss - taxable_income, 0.0)
                tax_effect = -taxable_after_losses * marginal_tax_rate
            else:
                carry_forward_loss += abs(taxable_income)
                tax_effect = 0.0

        cashflows.append(annual_rent - interest_cost - non_interest_costs + tax_effect)
        annual_rent *= 1 + rental_growth_pct
        property_value *= 1 + capital_growth_pct

    sale_price = property_value
    exit_value = sale_price - (sale_price * selling_cost_pct)
    cost_base = property_price + purchase_costs
    nominal_gain = max(exit_value - cost_base, 0.0)
    adjusted_exit_value = max(exit_value - carry_forward_loss, cost_base)
    exit_tax = sale_tax_for_asset(
        cost_base=cost_base,
        exit_value=adjusted_exit_value,
        annual_growth=capital_growth_pct,
        holding_years=holding_years,
        inflation_rate=inflation_rate,
        marginal_tax_rate=marginal_tax_rate,
        acquisition_timing=acquisition_timing,
        eligible_new_build=eligible_new_build,
    )
    sale_proceeds_after_tax = exit_value - loan_balance - exit_tax
    ending_wealth = sale_proceeds_after_tax + compound_cashflows(cashflows, reinvest_rate)

    explanation = (
        "Retains salary-offset negative gearing and a CGT choice on sale."
        if eligible_new_build
        else "Loses salary-offset negative gearing after the transition period, so yield matters much more."
    )

    if carry_forward_loss > 0:
        explanation += f" Remaining carried property losses at sale were approximated at {money(carry_forward_loss)}."

    if nominal_gain <= 0:
        explanation += " Exit assumptions do not produce a nominal capital gain."

    return StrategyResult(
        name=strategy_name,
        ending_wealth=ending_wealth,
        year_one_cashflow=cashflows[0],
        average_cashflow=sum(cashflows) / holding_years,
        exit_tax=exit_tax,
        total_tax_relief=total_tax_relief,
        initial_outlay=initial_outlay,
        explanation=explanation,
    )


def model_shares(
    *,
    initial_outlay: float,
    brokerage_pct: float,
    dividend_yield_pct: float,
    franked_fraction: float,
    company_tax_rate: float,
    capital_growth_pct: float,
    management_fee_pct: float,
    marginal_tax_rate: float,
    holding_years: int,
    inflation_rate: float,
    acquisition_timing: str,
) -> StrategyResult:
    buy_cost = initial_outlay * brokerage_pct
    cost_base = initial_outlay
    portfolio_value = initial_outlay - buy_cost
    cashflows: List[float] = []

    for _ in range(holding_years):
        gross_dividend = portfolio_value * dividend_yield_pct
        franked_dividend = gross_dividend * franked_fraction
        franking_credit = franked_dividend * (company_tax_rate / (1 - company_tax_rate))
        tax_on_dividends = (gross_dividend + franking_credit) * marginal_tax_rate
        net_tax = tax_on_dividends - franking_credit
        after_tax_dividend = gross_dividend - net_tax
        management_fee = portfolio_value * management_fee_pct

        portfolio_value = portfolio_value * (1 + capital_growth_pct) - management_fee + after_tax_dividend
        cost_base += after_tax_dividend
        cashflows.append(after_tax_dividend)

    sale_proceeds = portfolio_value - (portfolio_value * brokerage_pct)
    exit_tax = sale_tax_for_asset(
        cost_base=cost_base,
        exit_value=sale_proceeds,
        annual_growth=capital_growth_pct,
        holding_years=holding_years,
        inflation_rate=inflation_rate,
        marginal_tax_rate=marginal_tax_rate,
        acquisition_timing=acquisition_timing,
        eligible_new_build=False,
    )

    explanation = (
        "Shares still lose the 50% CGT discount under the proposal, but they avoid stamp duty, leverage pressure "
        "and quarantined rental losses."
    )

    return StrategyResult(
        name="Shares / ETF portfolio",
        ending_wealth=sale_proceeds - exit_tax,
        year_one_cashflow=cashflows[0],
        average_cashflow=sum(cashflows) / holding_years,
        exit_tax=exit_tax,
        total_tax_relief=0.0,
        initial_outlay=initial_outlay,
        explanation=explanation,
    )


def build_area_frame(weights: Dict[str, float]) -> pd.DataFrame:
    rows = []
    for profile in AREA_PROFILES:
        weighted_score = sum(profile["scores"][key] * weights[key] for key in weights)
        rows.append(
            {
                "Profile": profile["profile"],
                "Type": profile["type"],
                "Proposal score": round(weighted_score, 2),
                "Why it wins or loses": profile["notes"],
                **{AREA_DIMENSIONS[key]: profile["scores"][key] for key in weights},
            }
        )
    return pd.DataFrame(rows).sort_values("Proposal score", ascending=False).reset_index(drop=True)


def recommendation_text(
    established: StrategyResult,
    new_build: StrategyResult,
    shares: StrategyResult,
) -> str:
    ordered = sorted([established, new_build, shares], key=lambda item: item.ending_wealth, reverse=True)
    top = ordered[0]
    second = ordered[1]
    margin = top.ending_wealth - second.ending_wealth

    if top.name == "Established residential property":
        lead = "Established property still wins on your assumptions, but only because the growth/yield mix is strong enough to overcome the proposed tax drag."
    elif top.name == "New build residential property":
        lead = "New build property wins on your assumptions, which is exactly what the proposed rules are designed to encourage."
    else:
        lead = "Shares win on your assumptions, which suggests the proposed rules are making leveraged established property less compelling than liquid diversified assets."

    return f"{lead} The lead over the next-best option is {money(margin)} of after-tax ending wealth."


def build_summary_points(
    *,
    established: StrategyResult,
    new_build: StrategyResult,
    shares: StrategyResult,
    acquisition_timing: str,
    holding_years: int,
    property_price: float,
    deposit_pct: float,
    interest_rate: float,
    area_df: pd.DataFrame,
) -> List[str]:
    ranked = sorted([established, new_build, shares], key=lambda item: item.ending_wealth, reverse=True)
    top = ranked[0]
    second = ranked[1]
    margin = top.ending_wealth - second.ending_wealth

    summary = [
        f"On the current settings, **{top.name}** is the best of the three options, ahead of the next-best option by **{money(margin)}** of after-tax ending wealth over **{holding_years} years**.",
        f"You are testing a **{acquisition_timing.lower()}** scenario on a **{money(property_price)}** property with a **{deposit_pct * 100:.0f}% deposit** and **{interest_rate * 100:.2f}% interest rate**, so the recommendation reflects the proposed rules after leverage and cashflow pressure are applied.",
    ]

    if top.name == "Shares / ETF portfolio":
        summary.append(
            "The current inputs imply that liquidity, diversification and the absence of quarantined rental losses are outweighing the leverage advantage of property. That usually means the property assumptions are not strong enough to justify the extra tax, debt and concentration risk."
        )
    elif top.name == "New build residential property":
        summary.append(
            "The current inputs imply that the proposal's tax preference for genuine new supply is strong enough to overcome the usual frictions of property. This is the clearest sign that the budget changes are redirecting capital toward new builds rather than established investor stock."
        )
    else:
        summary.append(
            "The current inputs imply that this established property still has enough growth and/or yield to stand on its own economics even after the proposed tax drag. That is a higher bar than under the old regime, so the result should be treated as a fundamentals-led win, not a tax-led win."
        )

    if established.year_one_cashflow < 0 <= new_build.year_one_cashflow:
        summary.append(
            "Your settings show a useful split between property types: the established property is negative in year-one cashflow while the new build is not. Under the proposal, that matters a lot because established-property losses become much less valuable."
        )
    elif established.year_one_cashflow < 0 and new_build.year_one_cashflow < 0:
        summary.append(
            "Both property paths are still negative in year-one cashflow on these settings. Under the proposed regime, that makes yield and debt discipline especially important because cashflow pain is no longer cushioned in the old way for established property."
        )
    else:
        summary.append(
            "The property settings are already reasonably cashflow-supportive. Under the proposed regime, this is exactly the kind of profile that holds up better than a low-yield tax-loss strategy."
        )

    top_winner = area_df.iloc[0]
    top_loser = area_df.iloc[-1]
    summary.append(
        f"On your current area weightings, the strongest long-run profile is **{top_winner['Profile']}**, while the weakest is **{top_loser['Profile']}**. That means your own settings are favouring assets with stronger structural resilience under the proposal and penalising assets that depend on investor tax support or oversupplied stock."
    )

    return summary


st.set_page_config(page_title="Australia Tax Proposal Investment Model", layout="wide")

st.title("Australia investment model under the proposed 2026 Budget tax changes")
st.caption(
    "Proposal-first view. This app assumes the announced negative gearing and CGT reforms proceed broadly as outlined. "
    "It is a research tool, not personal financial or tax advice."
)

tab_summary, tab_report, tab_model, tab_areas = st.tabs(
    ["Summary", "New report", "Property vs shares model", "Winners and losers map"]
)

with tab_report:
    report_path = Path(__file__).with_name("budget_proposal_report.md")
    st.subheader("Fresh report focused on the proposed regime")
    if report_path.exists():
        st.markdown(report_path.read_text())
    else:
        st.error("budget_proposal_report.md is missing.")

    st.subheader("Proposal items used in the model")
    proposal_df = pd.DataFrame(PROPOSAL_UPDATES)[["topic", "status", "effective", "impact"]]
    proposal_df.columns = ["Topic", "Status", "Effective", "Why it matters"]
    render_wrapped_table(proposal_df)

with tab_model:
    st.subheader("Compare established property, new build property and shares")
    st.info(
        "Default framing: you are making future investment decisions after the budget announcement, not asking what is still current law today."
    )

    left, right = st.columns(2)

    with left:
        acquisition_timing = st.selectbox(
            "When are you buying?",
            ["Buy now (announcement to 30 June 2027)", "Buy after 1 July 2027"],
            help="Buying now keeps some transitional value before the full proposed regime starts.",
        )
        holding_years = st.slider("Holding period", 5, 30, 15)
        marginal_tax_rate = st.slider("Combined marginal tax rate", 0.0, 50.0, 39.0, 0.5, format="%.2f%%") / 100
        inflation_rate = st.slider("Long-run CPI assumption", 0.0, 6.0, 2.5, 0.25, format="%.2f%%") / 100
        reinvest_rate = st.slider("Rate earned on spare property cashflow", 0.0, 8.0, 4.0, 0.5, format="%.2f%%") / 100

        st.markdown("**Shared property leverage settings**")
        property_price = st.number_input("Property price", min_value=200_000, value=900_000, step=25_000)
        deposit_pct = st.slider("Deposit", 10.0, 60.0, 20.0, 1.0, format="%.2f%%") / 100
        interest_rate = st.slider("Interest rate", 3.0, 10.0, 6.2, 0.1, format="%.2f%%") / 100
        purchase_cost_pct = st.slider("Purchase cost load", 1.0, 8.0, 5.5, 0.1, format="%.2f%%") / 100
        selling_cost_pct = st.slider("Selling cost load", 0.5, 5.0, 2.5, 0.1, format="%.2f%%") / 100
        non_interest_cost_pct = st.slider("Annual non-interest cost load", 0.3, 3.0, 1.2, 0.1, format="%.2f%%") / 100

    with right:
        st.markdown("**Established residential assumptions**")
        established_yield = st.slider("Established gross rental yield", 2.0, 8.0, 3.5, 0.25, format="%.2f%%") / 100
        established_rent_growth = st.slider("Established rent growth", 0.0, 7.0, 3.0, 0.25, format="%.2f%%") / 100
        established_cap_growth = st.slider("Established capital growth", 0.0, 10.0, 5.5, 0.25, format="%.2f%%") / 100

        st.markdown("**New build residential assumptions**")
        new_build_yield = st.slider("New build gross rental yield", 2.0, 8.0, 4.5, 0.25, format="%.2f%%") / 100
        new_build_rent_growth = st.slider("New build rent growth", 0.0, 7.0, 3.0, 0.25, format="%.2f%%") / 100
        new_build_cap_growth = st.slider("New build capital growth", 0.0, 10.0, 4.5, 0.25, format="%.2f%%") / 100

        st.markdown("**Shares assumptions**")
        dividend_yield_pct = st.slider("Dividend yield", 1.0, 7.0, 3.5, 0.25, format="%.2f%%") / 100
        franked_fraction = st.slider("Franked share of dividends", 0.00, 1.00, 0.75, 0.05)
        company_tax_rate = st.slider("Franking rate", 25.0, 30.0, 30.0, 1.0, format="%.2f%%") / 100
        shares_cap_growth = st.slider("Shares capital growth", 0.0, 10.0, 5.5, 0.25, format="%.2f%%") / 100
        management_fee_pct = st.slider("ETF / fund fee load", 0.0, 2.0, 0.2, 0.05, format="%.2f%%") / 100
        brokerage_pct = st.slider("Brokerage / execution cost", 0.0, 1.0, 0.1, 0.05, format="%.2f%%") / 100

    established = model_property(
        strategy_name="Established residential property",
        property_price=property_price,
        deposit_pct=deposit_pct,
        purchase_cost_pct=purchase_cost_pct,
        selling_cost_pct=selling_cost_pct,
        interest_rate=interest_rate,
        gross_yield_pct=established_yield,
        rental_growth_pct=established_rent_growth,
        capital_growth_pct=established_cap_growth,
        non_interest_cost_pct=non_interest_cost_pct,
        marginal_tax_rate=marginal_tax_rate,
        holding_years=holding_years,
        reinvest_rate=reinvest_rate,
        inflation_rate=inflation_rate,
        acquisition_timing=acquisition_timing,
        eligible_new_build=False,
    )

    new_build = model_property(
        strategy_name="New build residential property",
        property_price=property_price,
        deposit_pct=deposit_pct,
        purchase_cost_pct=purchase_cost_pct,
        selling_cost_pct=selling_cost_pct,
        interest_rate=interest_rate,
        gross_yield_pct=new_build_yield,
        rental_growth_pct=new_build_rent_growth,
        capital_growth_pct=new_build_cap_growth,
        non_interest_cost_pct=non_interest_cost_pct,
        marginal_tax_rate=marginal_tax_rate,
        holding_years=holding_years,
        reinvest_rate=reinvest_rate,
        inflation_rate=inflation_rate,
        acquisition_timing=acquisition_timing,
        eligible_new_build=True,
    )

    shares = model_shares(
        initial_outlay=established.initial_outlay,
        brokerage_pct=brokerage_pct,
        dividend_yield_pct=dividend_yield_pct,
        franked_fraction=franked_fraction,
        company_tax_rate=company_tax_rate,
        capital_growth_pct=shares_cap_growth,
        management_fee_pct=management_fee_pct,
        marginal_tax_rate=marginal_tax_rate,
        holding_years=holding_years,
        inflation_rate=inflation_rate,
        acquisition_timing=acquisition_timing,
    )

    st.success(recommendation_text(established, new_build, shares))

    results = [established, new_build, shares]
    results_df = pd.DataFrame(
        [
            {
                "Strategy": result.name,
                "Initial cash outlay": money(result.initial_outlay),
                "Year 1 after-tax cashflow": money(result.year_one_cashflow),
                "Average annual after-tax cashflow": money(result.average_cashflow),
                "Exit tax": money(result.exit_tax),
                "Tax relief from salary-offset losses": money(result.total_tax_relief),
                "After-tax ending wealth": money(result.ending_wealth),
            }
            for result in results
        ]
    )
    render_wrapped_table(results_df)

    chart_df = pd.DataFrame(
        [{"Strategy": result.name, "After-tax ending wealth": result.ending_wealth} for result in results]
    )
    st.bar_chart(chart_df.set_index("Strategy"), use_container_width=True)

    st.markdown("**How the proposal changes the decision**")
    for result in results:
        st.write(f"- **{result.name}:** {result.explanation}")

    st.markdown("**Yield versus growth test for established property under the proposal**")
    grid_rows = []
    for test_yield in [0.03, 0.04, 0.05, 0.06]:
        row = {"Yield \\ Growth": pct(test_yield)}
        for test_growth in [0.03, 0.05, 0.07, 0.09]:
            stress_result = model_property(
                strategy_name="Established residential property",
                property_price=property_price,
                deposit_pct=deposit_pct,
                purchase_cost_pct=purchase_cost_pct,
                selling_cost_pct=selling_cost_pct,
                interest_rate=interest_rate,
                gross_yield_pct=test_yield,
                rental_growth_pct=established_rent_growth,
                capital_growth_pct=test_growth,
                non_interest_cost_pct=non_interest_cost_pct,
                marginal_tax_rate=marginal_tax_rate,
                holding_years=holding_years,
                reinvest_rate=reinvest_rate,
                inflation_rate=inflation_rate,
                acquisition_timing=acquisition_timing,
                eligible_new_build=False,
            )
            row[pct(test_growth)] = money(stress_result.ending_wealth - shares.ending_wealth)
        grid_rows.append(row)
    render_wrapped_table(pd.DataFrame(grid_rows))

    st.markdown("**Future asset-class tilt implied by this model**")
    outlook_df = pd.DataFrame(FUTURE_OUTLOOK)
    outlook_df.columns = ["Asset", "Future view", "Core reason", "Who it suits"]
    render_wrapped_table(outlook_df)

with tab_areas:
    st.subheader("Likely winners and losers if the proposal becomes the new normal")
    st.caption(
        "This framework focuses on 20-30 year structural resilience after the proposed negative gearing and CGT changes, "
        "not short-term speculation."
    )

    weight_columns = st.columns(4)
    weights: Dict[str, float] = {}
    for index, key in enumerate(AREA_DIMENSIONS):
        with weight_columns[index % 4]:
            weights[key] = st.slider(AREA_DIMENSIONS[key], 0.0, 3.0, 1.0, 0.25, key=f"weight_{key}")

    area_df = build_area_frame(weights)
    render_wrapped_table(area_df)

    st.markdown("**Top proposal-era winners on your weighting**")
    for _, row in area_df.head(3).iterrows():
        st.write(f"- **{row['Profile']}** — {row['Why it wins or loses']}")

    st.markdown("**Top proposal-era losers on your weighting**")
    for _, row in area_df.tail(3).iterrows():
        st.write(f"- **{row['Profile']}** — {row['Why it wins or loses']}")

    st.markdown("**Plain-English read**")
    st.write(
        "Under the proposed regime, the best residential assets are less likely to be generic negative-cashflow investor stock "
        "and more likely to be either true new-supply assets or established assets with enough yield, scarcity and owner-occupier "
        "depth to stand on their own economics."
    )

with tab_summary:
    st.subheader("Dynamic recommendation summary")
    st.caption("This text updates automatically from the current model inputs and area-weighting settings.")

    summary_points = build_summary_points(
        established=established,
        new_build=new_build,
        shares=shares,
        acquisition_timing=acquisition_timing,
        holding_years=holding_years,
        property_price=property_price,
        deposit_pct=deposit_pct,
        interest_rate=interest_rate,
        area_df=area_df,
    )

    st.markdown("### Recommendation")
    st.write(recommendation_text(established, new_build, shares))

    st.markdown("### What that means on your current settings")
    for point in summary_points:
        st.write(point)

    ranked_results = sorted([established, new_build, shares], key=lambda item: item.ending_wealth, reverse=True)
    st.markdown("### Ranking")
    for index, result in enumerate(ranked_results, start=1):
        st.write(
            f"{index}. **{result.name}** — ending wealth {money(result.ending_wealth)}, "
            f"year-one cashflow {money(result.year_one_cashflow)}, exit tax {money(result.exit_tax)}."
        )

    st.markdown("### Property read")
    if new_build.ending_wealth > established.ending_wealth:
        st.write(
            "On your current settings, the proposed rules are favouring new-build residential over established residential. "
            "That usually means the tax advantage for genuine new supply is meaningful enough to change the ranking."
        )
    else:
        st.write(
            "On your current settings, established residential is still competitive with or ahead of new-build residential. "
            "That suggests the underlying economics are strong enough that the proposal is not fully overturning the case for established stock."
        )

    st.markdown("### Area read")
    st.write(
        f"Your current weightings point most strongly toward **{area_df.iloc[0]['Profile']}** and least strongly toward "
        f"**{area_df.iloc[-1]['Profile']}**."
    )
