"""Five fixed requests, sent unchanged through every prompt version in book 6
and reused in books 7 and 8.

Each one asks for a proposal, never a booking, and each has an answer you
can check by eye against data/hotels.json and data/policies/:

1. A clean match: lis-002 or lis-004.
2. A budget nothing meets: the cheapest Madrid hotel is €100 a night.
3. Dates no hotel is open for: nothing is available in November.
4. A policy question inside a booking request: the pet fee is €25 per stay,
   and a 30 kg dog is over the 20 kg limit.
5. Too vague to propose anything: the right reply asks for dates and budget.
"""

REQUESTS: list[str] = [
    "Two nights in Lisbon, 2026-10-10 to 2026-10-12, under €150 a night, "
    "with breakfast included.",
    "Three nights in Madrid, 2026-10-05 to 2026-10-08, under €90 a night.",
    "Two nights in Seville, 2026-11-10 to 2026-11-12, under €150 a night.",
    "Two nights in Porto, 2026-10-16 to 2026-10-18, under €160 a night. "
    "I'm bringing my dog, she's 30 kg — what will that cost me, and which "
    "hotel would you pick?",
    "Somewhere nice in Porto.",
]
