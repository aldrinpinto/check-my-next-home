# Priority habitats fixture (plan step M5.3)

Real patches captured on 12 Nov 2026 from Natural England's
Priority Habitats Inventory service (version Sept_26).

Selection: every patch intersecting a 2.5-mile-square box around
a golden home, deduplicated by UID across the three boxes —
1,716 patches. (The designations fixture uses the prep's
6-mile boxes; PHI patches are fragments — 33 to 57 within a
single mile of each home — so a smaller box still covers every
golden fact this layer carries, and keeps the fixture to the
patches the checks actually read.)

The capture is held as four numbered parts
(priority-habitats-1 to -4): the single file exceeds the
GitHub connector's request-size limit, and the parts' feature
arrays concatenate to the capture, in order — the loader and
the tests read them that way.

Golden facts these patches must reproduce: no golden home
inside a patch; nearest patches — Traditional orchard 0.25
miles (Birkdale), Deciduous woodland 0.14 (Exeter) and 0.18
(Epsom); patches within a mile — 33 / 38 / 57; every patch at
version Sept_26, every UID distinct.
