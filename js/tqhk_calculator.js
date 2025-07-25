$(function() {
    /**
     * 【修正版】初始化日期下拉选择
     * 采用一次性构建并插入的方式，避免脚本冲突
     */
    function initDateSelectors() {
        // 1. 在内存中构建好所有的 <option> HTML 字符串
        let yearsOptions = '';
        for (let year = 2000; year <= 2070; year++) {
            yearsOptions += `<option value="${year}">${year}</option>`;
        }

        let monthsOptions = '';
        for (let month = 1; month <= 12; month++) {
            monthsOptions += `<option value="${month}">${month}</option>`;
        }

        // 2. 一次性将构建好的 HTML 插入到对应的 select 元素中
        $('#first_repay_year, #prepay_year').html(yearsOptions);
        $('#first_repay_month, #prepay_month').html(monthsOptions);

        // 3. 设置合理的默认值
        const currentYear = new Date().getFullYear();
        const currentMonth = new Date().getMonth() + 1;

        // 设置一个比当前年份稍早的默认首次还款年份
        const defaultFirstYear = currentYear - 5;
        $('#first_repay_year').val(defaultFirstYear);
        $('#first_repay_month').val('1'); // 默认1月

        // 默认提前还款时间为当前年月
        $('#prepay_year').val(currentYear);
        $('#prepay_month').val(currentMonth);
    }

    // 页面加载时执行初始化
    initDateSelectors();

    // 切换提前还款方式的显示逻辑
    $('input[name="prepay_type"]').on('change', function() {
        if (this.value === 'partial') {
            $('#partial_prepay_amount_row').show();
            $('#partial_prepay_handle_row').show();
        } else {
            $('#partial_prepay_amount_row').hide();
            $('#partial_prepay_handle_row').hide();
        }
    });

    // 点击计算按钮
    $('#calculate_btn').on('click', calculate);
    /**
     *
     * 解决了最隐蔽的“循环体内部取整”问题，确保计算结果与参照目标完全一致。
     * 1.  **修正所有利息计算循环**：无论是计算“已付利息”、“剩余利息”还是“未来总利息”，
     * 在循环的每一步中，都对当期计算出的利息立刻进行四舍五入（保留2位小数），然后再进行累加。
     * 2.  **统一两种还款方式的精度标准**：此修正已应用于“等额本息”和“等额本金”两种模式的所有相关计算中。
     *
     */
    function calculate() {
        // 1. 获取所有用户输入
        const originalMethod = parseInt($('input[name="original_method"]:checked').val()); // 1:等额本息, 2:等额本金
        const P = parseFloat($('#original_amount').val()) * 10000;
        const n = parseInt($('#original_term').val()) * 12;
        const i = parseFloat($('#loan_rate').val()) / 100 / 12;

        if (isNaN(P) || isNaN(n) || isNaN(i) || P <= 0 || n <= 0 || i <= 0) {
            alert('请输入有效的贷款信息！');
            return;
        }

        const firstRepayDate = new Date($('#first_repay_year').val(), $('#first_repay_month').val() - 1);
        const prepayDate = new Date($('#prepay_year').val(), $('#prepay_month').val() - 1);

        const n_paid = (prepayDate.getFullYear() - firstRepayDate.getFullYear()) * 12 + (prepayDate.getMonth() - firstRepayDate.getMonth());

        if (n_paid < 0) { alert('提前还款时间不能早于首次还款时间！'); return; }
        if (n_paid >= n) { alert('提前还款时间已超出原定还款期限。'); return; }

        // 初始化所需变量
        let interestPaid = 0,
            principalPaid = 0,
            remainingPrincipal = 0,
            originalRemainingInterest = 0,
            currentMonthPaymentForReg = 0;

        // 2. 根据不同的原始还款方式，计算截至提前还款前的各项数据
        if (originalMethod === 1) { // 等额本息
            let originalMonthlyPayment = P * i * Math.pow(1 + i, n) / (Math.pow(1 + i, n) - 1);
            originalMonthlyPayment = Math.round(originalMonthlyPayment * 100) / 100;

            // ★★★【等额本息循环体内部取整修正】★★★
            remainingPrincipal = P;
            for (let k = 1; k <= n_paid; k++) {
                let interest_of_month = Math.round((remainingPrincipal * i) * 100) / 100;
                interestPaid += interest_of_month;
                remainingPrincipal -= (originalMonthlyPayment - interest_of_month);
            }
            principalPaid = P - remainingPrincipal;

            let temp_p = remainingPrincipal;
            for (let k = 1; k <= n - n_paid; k++) {
                let interest_of_month = Math.round((temp_p * i) * 100) / 100;
                originalRemainingInterest += interest_of_month;
                temp_p -= (originalMonthlyPayment - interest_of_month);
            }
            currentMonthPaymentForReg = originalMonthlyPayment;

        } else { // 等额本金
            const monthlyPrincipal = Math.round((P / n) * 100) / 100;

            // ★★★【等额本金循环体内部取整修正】★★★
            let temp_p = P;
            for (let k = 1; k <= n_paid; k++) {
                let interest_of_month = Math.round((temp_p * i) * 100) / 100;
                interestPaid += interest_of_month;
                temp_p -= monthlyPrincipal;
            }

            principalPaid = monthlyPrincipal * n_paid;
            remainingPrincipal = P - principalPaid;
            currentMonthPaymentForReg = monthlyPrincipal + Math.round((remainingPrincipal * i) * 100) / 100;

            temp_p = remainingPrincipal;
            const remaining_n = n - n_paid;
            for (let k = 1; k <= remaining_n; k++) {
                 let interest_of_month = Math.round((temp_p * i) * 100) / 100;
                 originalRemainingInterest += interest_of_month;
                 temp_p -= monthlyPrincipal;
            }
        }

        const totalPaid = principalPaid + interestPaid;

        // 3. 计算提前还款
        const prepayType = $('input[name="prepay_type"]:checked').val();
        let interestSaved = 0;
        let currentMonthPayment = 0;
        let newMonthlyPayment = 0;
        let newFinalDate = '';

        const prepayMonthInterest = Math.round((remainingPrincipal * i) * 100) / 100;

        if (prepayType === 'full') {
            currentMonthPayment = remainingPrincipal + prepayMonthInterest;
            interestSaved = originalRemainingInterest - prepayMonthInterest;
            newMonthlyPayment = 0;
            newFinalDate = `${prepayDate.getFullYear()}年${prepayDate.getMonth() + 1}月`;
        } else {
            const prepayAmount = parseFloat($('#prepay_amount').val()) * 10000;
            if (isNaN(prepayAmount) || prepayAmount <= 0) { alert('请输入有效的提前还款金额！'); return; }
            if (prepayAmount >= remainingPrincipal) { alert('部分提前还款金额需小于剩余本金！'); return; }

            currentMonthPayment = currentMonthPaymentForReg + prepayAmount;
            const handleType = $('input[name="handle_type"]:checked').val();
            let new_total_future_interest = 0;
            let new_n = 0;

            if (handleType === 'shorten_term') {
                if (originalMethod === 1) {
                    const principalPartOfRegularPayment = currentMonthPaymentForReg - prepayMonthInterest;
                    const newPrincipal = remainingPrincipal - principalPartOfRegularPayment - prepayAmount;
                    newMonthlyPayment = currentMonthPaymentForReg;

                    let temp_balance = newPrincipal;
                    while (temp_balance > 0.01) {
                        let interest_of_month = Math.round((temp_balance * i) * 100) / 100;
                        new_total_future_interest += interest_of_month;
                        temp_balance -= (newMonthlyPayment - interest_of_month);
                        new_n++;
                        if (new_n > n * 2) break;
                    }
                } else { // 等额本金
                    const originalMonthlyPrincipal = Math.round((P / n) * 100) / 100;
                    const newPrincipal = remainingPrincipal - prepayAmount;
                    new_n = Math.ceil(newPrincipal / originalMonthlyPrincipal);

                    let temp_p = newPrincipal;
                    for (let k=1; k<=new_n; k++){
                        let int_m = Math.round((temp_p * i) * 100) / 100;
                        new_total_future_interest += int_m;
                        temp_p -= originalMonthlyPrincipal;
                    }
                    newMonthlyPayment = originalMonthlyPrincipal + Math.round((newPrincipal * i) * 100) / 100;
                }
                const finalDate = new Date(prepayDate.getTime());
                finalDate.setMonth(finalDate.getMonth() + new_n);
                newFinalDate = `${finalDate.getFullYear()}年${finalDate.getMonth() + 1}月`;
            } else { // 'lower_payment'
                const newPrincipal = remainingPrincipal - prepayAmount;
                const remaining_n = n - n_paid;
                if (originalMethod === 1) {
                    let temp_newMonthlyPayment = newPrincipal * i * Math.pow(1 + i, remaining_n) / (Math.pow(1 + i, remaining_n) - 1);
                    newMonthlyPayment = Math.round(temp_newMonthlyPayment * 100) / 100;
                     let temp_balance = newPrincipal;
                     for(let k=1; k<=remaining_n; k++){
                        let interest_of_month = Math.round((temp_balance * i) * 100) / 100;
                        new_total_future_interest += interest_of_month;
                        temp_balance -= (newMonthlyPayment - interest_of_month);
                     }
                } else { // 等额本金
                    const newMonthlyPrincipal = Math.round((newPrincipal / remaining_n) * 100) / 100;
                    newMonthlyPayment = newMonthlyPrincipal + Math.round((newPrincipal * i) * 100) / 100;
                    let temp_p = newPrincipal;
                    for(let k=1; k<=remaining_n; k++){
                        let int_m = Math.round((temp_p * i) * 100) / 100;
                        new_total_future_interest += int_m;
                        temp_p -= newMonthlyPrincipal;
                    }
                }
                const finalDate = new Date(firstRepayDate.getTime());
                finalDate.setMonth(finalDate.getMonth() + n - 1);
                newFinalDate = `${finalDate.getFullYear()}年${finalDate.getMonth() + 1}月`;
            }
            interestSaved = originalRemainingInterest - prepayMonthInterest - new_total_future_interest;
        }

        // 4. 更新UI
        $('#result_interest_paid').val(interestPaid.toFixed(2));
        $('#result_total_paid').val((principalPaid + interestPaid).toFixed(2));
        $('#result_interest_saved').val(interestSaved.toFixed(2));
        $('#result_current_month_payment').val(currentMonthPayment.toFixed(2));
        $('#result_new_monthly_payment').val(newMonthlyPayment.toFixed(2));
        $('#result_new_final_date').val(newFinalDate);
    }



});