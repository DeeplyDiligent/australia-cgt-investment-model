# Australia CGT Investment Model

This repository contains two separate investment modelling applications.

## Repository layout

```text
apps/
  policy-comparison/       Streamlit CGT policy comparison app
  scenario-modeller/       Browser-based investment scenario modeller
    artifacts/             Optimiser results and run logs
    scripts/               Optimisation utilities
    tests/                 Simulation engine tests
data/                      Reference data exports
docs/                      Analysis reports and supporting notes
```

Legacy copies for the Streamlit app are retained in
`apps/policy-comparison/backups/`.

## Policy comparison app

```powershell
Set-Location apps\policy-comparison
python -m pip install -r requirements.txt
python -m streamlit run app.py
```

The app is available at `http://localhost:8501`.

## Scenario modeller

```powershell
Set-Location apps\scenario-modeller
npm run serve
```

Open `http://localhost:8765/scenario_modeller.html`.

Run its simulation tests with:

```powershell
npm test
```

Run the optimiser with:

```powershell
npm run optimize
```
