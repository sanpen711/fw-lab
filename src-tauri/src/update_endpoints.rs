use std::future::Future;

pub const MANIFEST_ENDPOINTS: [&str; 2] = [
    "https://fwyanjiusuo.com/download/windows-updater.json",
    "https://raw.githubusercontent.com/sanpen711/fw-lab/main/download/windows-updater.json",
];

// Explicit fallback also handles transport errors, before an HTTP status exists.
// A valid "no update" response is final and must not be replaced by a mirror.
pub async fn first_available<T, E, Check, CheckFuture>(mut check: Check) -> Result<T, Vec<E>>
where
    Check: FnMut(&'static str) -> CheckFuture,
    CheckFuture: Future<Output = Result<T, E>>,
{
    let mut errors = Vec::new();
    for endpoint in MANIFEST_ENDPOINTS {
        match check(endpoint).await {
            Ok(value) => return Ok(value),
            Err(error) => errors.push(error),
        }
    }
    Err(errors)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::future::ready;

    #[tokio::test]
    async fn transport_failure_uses_the_backup() {
        let mut calls = Vec::new();
        let result = first_available(|endpoint| {
            calls.push(endpoint);
            ready(if endpoint == MANIFEST_ENDPOINTS[0] {
                Err("TLS connection reset")
            } else {
                Ok(Some("1.3.34"))
            })
        }).await;
        assert_eq!(result, Ok(Some("1.3.34")));
        assert_eq!(calls, MANIFEST_ENDPOINTS);
    }

    #[tokio::test]
    async fn valid_current_version_does_not_query_a_mirror() {
        let mut calls = 0;
        let result = first_available(|_| {
            calls += 1;
            ready(Ok::<Option<&str>, &str>(None))
        }).await;
        assert_eq!(result, Ok(None));
        assert_eq!(calls, 1);
    }

    #[tokio::test]
    async fn failed_checks_keep_every_cause_for_the_log() {
        let result = first_available(|endpoint| ready(Err::<(), _>(endpoint))).await;
        assert_eq!(result, Err(MANIFEST_ENDPOINTS.to_vec()));
    }
}
