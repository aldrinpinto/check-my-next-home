import WholeCheckFailure from "../../../components/WholeCheckFailure";

// /search/failed — where the search box lands when the
// serve layer cannot resolve at all (plan step M7.3,
// fold-in 10): the whole-check failure state (D44(7)),
// built once in the journey shell and reused by M7.4 on
// the results route.

export default function FailedPage() {
  return <WholeCheckFailure />;
}
