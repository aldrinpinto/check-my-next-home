# lib — the brain

Shared logic lives here: the check engine, scoring and formatting helpers, and
anything more than one page or loader needs. Pages and loaders call into lib;
lib never calls back out to them.
